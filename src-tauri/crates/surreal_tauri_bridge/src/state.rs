use std::fs;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};

use async_channel::{Receiver, bounded};
use dashmap::DashMap;
use serde::Serialize;
use surrealdb_core::dbs::{Capabilities, Session};
use surrealdb_core::kvs::{Datastore, LockType, Transaction, TransactionType};
use surrealdb_core::rpc::format::cbor;
use surrealdb_core::rpc::{DbResponse, DbResult, Method, Request, RpcProtocol, invalid_request};
use surrealdb_types::{
    Array, Error as TypesError, HashMap, Notification, Number, SurrealValue, Value,
};
use tauri::ipc::Channel;
use tokio::runtime::Runtime;
use tokio::sync::{Mutex as AsyncMutex, RwLock};
use tokio::time::{self, MissedTickBehavior};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::error::{
    BridgeError, map_db_error, map_io_error, map_runtime_error, map_serialization_error,
    map_transport_error,
};

const DEFAULT_RUNTIME_STACK_SIZE: usize = 10 * 1024 * 1024;
const NODE_MEMBERSHIP_REFRESH_INTERVAL_SECS: u64 = 3;
const DEFAULT_SESSION_ID: Uuid = Uuid::nil();
const CBOR_RECURSION_LIMIT: usize = 256;

pub(crate) type ConnectionId = u32;

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", content = "data")]
pub enum BridgeChannelMessage {
    Binary(Vec<u8>),
}

#[derive(Default)]
pub(crate) struct BridgeShared {
    pub(crate) connections: DashMap<ConnectionId, Arc<RpcConnection>>,
    pub(crate) live_queries: DashMap<Uuid, (ConnectionId, Uuid)>,
}

pub(crate) struct BridgeCore {
    pub(crate) datastore: Arc<Datastore>,
    pub(crate) shared: Arc<BridgeShared>,
    notifications_canceller: CancellationToken,
}

impl Drop for BridgeCore {
    fn drop(&mut self) {
        self.notifications_canceller.cancel();
    }
}

pub struct BridgeState {
    runtime: Arc<Runtime>,
    next_connection_id: AtomicU32,
    inner: AsyncMutex<Option<Arc<BridgeCore>>>,
}

impl BridgeState {
    pub fn new() -> Result<Self, BridgeError> {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .thread_stack_size(DEFAULT_RUNTIME_STACK_SIZE)
            .thread_name("surrealdb-worker")
            .build()
            .map_err(map_runtime_error)?;

        Ok(Self {
            runtime: Arc::new(runtime),
            next_connection_id: AtomicU32::new(1),
            inner: AsyncMutex::new(None),
        })
    }

    pub(crate) fn next_connection_id(&self) -> ConnectionId {
        self.next_connection_id.fetch_add(1, Ordering::Relaxed)
    }

    pub(crate) async fn run_on_runtime<F, T>(&self, future: F) -> Result<T, BridgeError>
    where
        F: Future<Output = Result<T, BridgeError>> + Send + 'static,
        T: Send + 'static,
    {
        self.runtime
            .handle()
            .spawn(future)
            .await
            .map_err(map_runtime_error)?
    }

    pub(crate) async fn ensure_initialized(
        &self,
        app_data_dir: &Path,
    ) -> Result<Arc<BridgeCore>, BridgeError> {
        let mut guard = self.inner.lock().await;

        if let Some(existing) = guard.as_ref() {
            return Ok(existing.clone());
        }

        let db_dir = storage_dir(app_data_dir)?;
        let bucket_dir = files_dir(app_data_dir)?;

        std::env::set_var(
            "SURREAL_BUCKET_FOLDER_ALLOWLIST",
            bucket_dir.to_string_lossy().to_string(),
        );

        let db_url = format!("surrealkv://{}", db_dir.to_string_lossy());

        let initialized = self
            .runtime
            .handle()
            .spawn(async move {
                let capabilities = build_capabilities();
                let (notify_tx, notify_rx) = bounded(surrealdb_core::cnf::NOTIFICATIONS_CHANNEL_SIZE);
                let datastore = Datastore::builder()
                    .with_capabilities(capabilities)
                    .with_notify(notify_tx)
                    .build_with_path(&db_url)
                    .await
                    .map_err(map_db_error)?;

                datastore.bootstrap().await.map_err(map_db_error)?;

                let datastore = Arc::new(datastore);

                let shared = Arc::new(BridgeShared::default());
                let notifications_canceller = CancellationToken::new();

                let loop_shared = shared.clone();
                let loop_canceller = notifications_canceller.clone();
                tokio::spawn(async move {
                    notifications_loop(notify_rx, loop_shared, loop_canceller).await;
                });

                let node_datastore = datastore.clone();
                let node_canceller = notifications_canceller.clone();
                tokio::spawn(async move {
                    node_membership_loop(node_datastore, node_canceller).await;
                });

                Ok::<Arc<BridgeCore>, BridgeError>(Arc::new(BridgeCore {
                    datastore,
                    shared,
                    notifications_canceller,
                }))
            })
            .await
            .map_err(map_runtime_error)??;

        *guard = Some(initialized.clone());
        Ok(initialized)
    }

    pub(crate) fn bucket_folder_allowlist(&self) -> Result<Vec<String>, BridgeError> {
        let raw = std::env::var("SURREAL_BUCKET_FOLDER_ALLOWLIST").map_err(map_io_error)?;
        let folders: Vec<String> = std::env::split_paths(&raw)
            .filter_map(|path| {
                let value = path.to_string_lossy().trim().to_string();
                if value.is_empty() {
                    None
                } else {
                    Some(value)
                }
            })
            .collect();

        if folders.is_empty() {
            return Err(BridgeError::Io(
                "SURREAL_BUCKET_FOLDER_ALLOWLIST is empty".to_string(),
            ));
        }

        Ok(folders)
    }
}

pub(crate) struct RpcConnection {
    pub(crate) id: ConnectionId,
    pub(crate) datastore: Arc<Datastore>,
    pub(crate) shared: Arc<BridgeShared>,
    pub(crate) sessions: HashMap<Uuid, Arc<RwLock<Session>>>,
    pub(crate) transactions: DashMap<Uuid, Arc<Transaction>>,
    pub(crate) channel: Channel<BridgeChannelMessage>,
}

impl RpcConnection {
    pub(crate) fn new(
        id: ConnectionId,
        datastore: Arc<Datastore>,
        shared: Arc<BridgeShared>,
        channel: Channel<BridgeChannelMessage>,
    ) -> Self {
        let sessions = HashMap::new();
        let mut default_session = Session::default().with_rt(true);
        default_session.id = Some(DEFAULT_SESSION_ID);
        sessions.insert(DEFAULT_SESSION_ID, Arc::new(RwLock::new(default_session)));

        Self {
            id,
            datastore,
            shared,
            sessions,
            transactions: DashMap::new(),
            channel,
        }
    }

    pub(crate) async fn process_payload(&self, payload: Vec<u8>) -> Result<(), BridgeError> {
        let decoded = match cbor::decode(&payload, CBOR_RECURSION_LIMIT) {
            Ok(value) => value,
            Err(error) => {
                self.send_response(DbResponse::failure(
                    None,
                    None,
                    TypesError::internal(error.to_string()),
                ))?;
                return Ok(());
            }
        };

        let request = match decoded {
            Value::Object(object) => Request::from_object(object),
            _ => Err(invalid_request()),
        };

        let request = match request {
            Ok(request) => request,
            Err(error) => {
                self.send_response(DbResponse::failure(None, None, error))?;
                return Ok(());
            }
        };

        let method = request.method;
        let client_session_id = request.session_id.map(Into::into);
        let session_id = client_session_id.unwrap_or(DEFAULT_SESSION_ID);
        let txn_id = request.txn.map(Into::into);
        let mut result = self
            .execute(txn_id, session_id, client_session_id, request.method, request.params)
            .await;

        if method == Method::Info {
            patch_info_system_metrics(&mut result);
        }

        let response = match result {
            Ok(result) => DbResponse::success(request.id, client_session_id, result),
            Err(error) => DbResponse::failure(request.id, client_session_id, error),
        };

        self.send_response(response)
    }

    pub(crate) fn send_response(&self, response: DbResponse) -> Result<(), BridgeError> {
        let value = response.into_value();
        let payload = cbor::encode(value).map_err(map_serialization_error)?;

        self.channel
            .send(BridgeChannelMessage::Binary(payload))
            .map_err(map_transport_error)
    }
}

impl RpcProtocol for RpcConnection {
    fn kvs(&self) -> &Datastore {
        &self.datastore
    }

    fn version_data(&self) -> DbResult {
        DbResult::Other(Value::String("surrealdb-3.1.2".to_string()))
    }

    fn session_map(&self) -> &HashMap<Uuid, Arc<RwLock<Session>>> {
        &self.sessions
    }

    async fn get_tx(&self, id: Uuid) -> Result<Arc<Transaction>, TypesError> {
        self.transactions
            .get(&id)
            .map(|tx| tx.clone())
            .ok_or_else(|| surrealdb_core::rpc::invalid_params("Transaction not found"))
    }

    async fn set_tx(&self, id: Uuid, tx: Arc<Transaction>) -> Result<(), TypesError> {
        self.transactions.insert(id, tx);
        Ok(())
    }

    const LQ_SUPPORT: bool = true;

    async fn handle_live(
        &self,
        lqid: &Uuid,
        session_id: Uuid,
        _namespace: Option<String>,
        _database: Option<String>,
    ) {
        self.shared.live_queries.insert(*lqid, (self.id, session_id));
    }

    async fn handle_kill(&self, lqid: &Uuid) {
        self.shared.live_queries.remove(lqid);
    }

    async fn cleanup_lqs(&self, session_id: &Uuid) {
        let mut gc = Vec::new();

        self.shared.live_queries.retain(|query_id, value| {
            if value.0 == self.id && value.1 == *session_id {
                gc.push(*query_id);
                return false;
            }
            true
        });

        if let Err(error) = self.kvs().delete_queries(gc).await {
            eprintln!("failed to cleanup live queries: {error}");
        }
    }

    async fn cleanup_all_lqs(&self) {
        let mut gc = Vec::new();

        self.shared.live_queries.retain(|query_id, value| {
            if value.0 == self.id {
                gc.push(*query_id);
                return false;
            }
            true
        });

        if let Err(error) = self.kvs().delete_queries(gc).await {
            eprintln!("failed to cleanup all live queries: {error}");
        }
    }

    async fn begin(&self, _txn: Option<Uuid>, _session_id: Uuid) -> Result<DbResult, TypesError> {
        let tx = self
            .kvs()
            .transaction(TransactionType::Write, LockType::Optimistic)
            .await
            .map_err(surrealdb_core::rpc::types_error_from_anyhow)?;

        let id = Uuid::now_v7();
        self.transactions.insert(id, Arc::new(tx));

        Ok(DbResult::Other(Value::Uuid(surrealdb::types::Uuid::from(id))))
    }

    async fn commit(
        &self,
        _txn: Option<Uuid>,
        _session_id: Uuid,
        params: Array,
    ) -> Result<DbResult, TypesError> {
        let mut params_vec = params.into_vec();
        let Some(Value::Uuid(txn_id)) = params_vec.pop() else {
            return Err(surrealdb_core::rpc::invalid_params("Expected transaction UUID"));
        };

        let txn_id = txn_id.into_inner();
        let Some((_, tx)) = self.transactions.remove(&txn_id) else {
            return Err(surrealdb_core::rpc::invalid_params("Transaction not found"));
        };

        tx.commit()
            .await
            .map_err(surrealdb_core::rpc::types_error_from_anyhow)?;

        Ok(DbResult::Other(Value::None))
    }

    async fn cancel(
        &self,
        _txn: Option<Uuid>,
        _session_id: Uuid,
        params: Array,
    ) -> Result<DbResult, TypesError> {
        let mut params_vec = params.into_vec();
        let Some(Value::Uuid(txn_id)) = params_vec.pop() else {
            return Err(surrealdb_core::rpc::invalid_params("Expected transaction UUID"));
        };

        let txn_id = txn_id.into_inner();
        let Some((_, tx)) = self.transactions.remove(&txn_id) else {
            return Err(surrealdb_core::rpc::invalid_params("Transaction not found"));
        };

        tx.cancel()
            .await
            .map_err(surrealdb_core::rpc::types_error_from_anyhow)?;

        Ok(DbResult::Other(Value::None))
    }
}

fn build_capabilities() -> Capabilities {
    let capabilities = Capabilities::default().with_live_query_notifications(true);

    #[cfg(feature = "file-buckets")]
    let capabilities = capabilities.with_experimental(
        surrealdb_core::dbs::capabilities::ExperimentalTarget::Files.into(),
    );

    capabilities
}

async fn notifications_loop(
    channel: Receiver<Notification>,
    shared: Arc<BridgeShared>,
    canceller: CancellationToken,
) {
    loop {
        tokio::select! {
            _ = canceller.cancelled() => {
                break;
            }
            recv = channel.recv() => {
                let Ok(notification) = recv else {
                    break;
                };

                let live_id = *notification.id.as_ref();
                let Some(mapped) = shared.live_queries.get(&live_id) else {
                    continue;
                };

                let (connection_id, session_id) = *mapped.value();
                drop(mapped);

                let Some(connection_ref) = shared.connections.get(&connection_id) else {
                    continue;
                };

                let connection = connection_ref.value().clone();
                drop(connection_ref);

                let response = DbResponse::success(None, Some(session_id), DbResult::Live(notification));
                let _ = connection.send_response(response);
            }
        }
    }
}

async fn node_membership_loop(datastore: Arc<Datastore>, canceller: CancellationToken) {
    let mut ticker = time::interval(std::time::Duration::from_secs(
        NODE_MEMBERSHIP_REFRESH_INTERVAL_SECS,
    ));
    ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);

    loop {
        tokio::select! {
            _ = canceller.cancelled() => {
                break;
            }
            _ = ticker.tick() => {
                if let Err(error) = datastore.update_node().await {
                    eprintln!("failed to refresh node metrics: {error}");
                }
            }
        }
    }
}

fn patch_info_system_metrics(result: &mut Result<DbResult, TypesError>) {
    let Ok(DbResult::Other(Value::Object(root))) = result else {
        return;
    };

    let Some(Value::Object(system)) = root.get_mut("system") else {
        return;
    };

    let memory_usage = system.get("memory_usage").and_then(value_to_u64).unwrap_or(0);
    let memory_allocated = system
        .get("memory_allocated")
        .and_then(value_to_u64)
        .unwrap_or(0);

    if memory_allocated == 0 && memory_usage > 0 {
        system.insert("memory_allocated", memory_usage);
    }
}

fn value_to_u64(value: &Value) -> Option<u64> {
    let Value::Number(number) = value else {
        return None;
    };

    match number {
        Number::Int(value) => u64::try_from(*value).ok(),
        Number::Float(value) if *value >= 0.0 => Some(*value as u64),
        _ => None,
    }
}

fn storage_dir(app_data_dir: &Path) -> Result<PathBuf, BridgeError> {
    let db_dir = app_data_dir.join("surrealdb").join("db");
    fs::create_dir_all(&db_dir).map_err(map_io_error)?;
    fs::canonicalize(db_dir).map_err(map_io_error)
}

fn files_dir(app_data_dir: &Path) -> Result<PathBuf, BridgeError> {
    let bucket_dir = app_data_dir.join("surrealdb").join("files");
    fs::create_dir_all(&bucket_dir).map_err(map_io_error)?;
    fs::canonicalize(bucket_dir).map_err(map_io_error)
}