use std::collections::HashMap;
use std::error::Error;
use std::fmt::Display;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use futures_util::StreamExt;
use serde::Serialize;
use serde_json::json;
use tauri::Manager;
use surrealdb::engine::local::{Db, SurrealKv};
use surrealdb::method::Transaction;
#[cfg(feature = "file-buckets")]
use surrealdb::opt::capabilities::{Capabilities, ExperimentalFeature};
use surrealdb::opt::Config;
use surrealdb::Surreal;
use thiserror::Error;
use tokio::sync::{Mutex, broadcast, mpsc};
use uuid::Uuid;

mod commands;

#[doc(hidden)]
pub use commands::{
    db_begin_transaction, db_bucket_folder_allowlist, db_cancel_transaction,
    db_commit_transaction, db_drop_session, db_health, db_init, db_list_live_streams,
    db_list_sessions, db_list_transactions, db_live_query_stream, db_live_subscribe,
    db_live_unsubscribe, db_new_session, db_query, db_query_stream, db_set_session_var,
    db_unset_session_var, db_use_session, db_version,
};

#[macro_export]
macro_rules! invoke_handler {
    ($($user_command:path),* $(,)?) => {
        tauri::generate_handler![
            $crate::db_init,
            $crate::db_health,
            $crate::db_version,
            $crate::db_bucket_folder_allowlist,
            $crate::db_query,
            $crate::db_new_session,
            $crate::db_list_sessions,
            $crate::db_drop_session,
            $crate::db_use_session,
            $crate::db_set_session_var,
            $crate::db_unset_session_var,
            $crate::db_begin_transaction,
            $crate::db_list_transactions,
            $crate::db_commit_transaction,
            $crate::db_cancel_transaction,
            $crate::db_query_stream,
            $crate::db_live_query_stream,
            $crate::db_live_subscribe,
            $crate::db_live_unsubscribe,
            $crate::db_list_live_streams
            $(, $user_command)*
        ]
    };
}

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::<R>::new("surreal-tauri-bridge")
        .setup(|app, _api| {
            app.manage(EmbeddedBridge::new());

            let app_data_dir = app.path().app_data_dir().map_err(map_plugin_error)?;
            let bridge = app.state::<EmbeddedBridge>().inner().clone();

            tauri::async_runtime::block_on(async move {
                bridge.ensure_initialized(&app_data_dir).await
            })
            .map_err(map_plugin_error)?;

            Ok(())
        })
        .build()
}

fn map_plugin_error<E: Display>(err: E) -> Box<dyn Error> {
    Box::new(io::Error::other(err.to_string()))
}

#[derive(Clone, Debug, Default)]
struct SessionContext {
    namespace: Option<String>,
    database: Option<String>,
    vars: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug)]
struct TransactionContext {
    session_id: Uuid,
    tx: Transaction<Db>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryChunk {
    pub index: usize,
    pub execution_time_ms: Option<u128>,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
pub enum LiveSubscriptionEvent {
    Started {
        stream_id: String,
    },
    Notification {
        stream_id: String,
        query_id: String,
        action: String,
        data: serde_json::Value,
    },
    Finished {
        stream_id: String,
    },
    Cancelled {
        stream_id: String,
    },
    Failed {
        stream_id: String,
        error: String,
    },
}

#[derive(Debug, Error)]
pub enum BridgeError {
    #[error("io error: {0}")]
    Io(String),
    #[error("db error: {0}")]
    Db(String),
    #[error("database unavailable")]
    Unavailable,
}

impl Serialize for BridgeError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

fn map_io_error<E: Display>(err: E) -> BridgeError {
    BridgeError::Io(err.to_string())
}

fn map_db_error<E: Display>(err: E) -> BridgeError {
    BridgeError::Db(err.to_string())
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

#[derive(Clone, Default)]
pub struct EmbeddedBridge {
    inner: Arc<Mutex<Option<Arc<Surreal<Db>>>>>,
    query_guard: Arc<Mutex<()>>,
    sessions: Arc<Mutex<HashMap<Uuid, SessionContext>>>,
    transactions: Arc<Mutex<HashMap<Uuid, TransactionContext>>>,
    live_streams: Arc<Mutex<HashMap<String, broadcast::Sender<()>>>>,
    next_live_stream_id: Arc<AtomicU64>,
}

impl EmbeddedBridge {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn new_session(&self) -> String {
        let id = Uuid::now_v7();
        let mut sessions = self.sessions.lock().await;
        sessions.insert(id, SessionContext::default());
        id.to_string()
    }

    pub async fn list_sessions(&self) -> Vec<String> {
        let sessions = self.sessions.lock().await;
        sessions.keys().map(Uuid::to_string).collect()
    }

    pub async fn drop_session(&self, session_id: &str) -> Result<(), BridgeError> {
        let session_id = Uuid::parse_str(session_id).map_err(map_db_error)?;

        {
            let mut sessions = self.sessions.lock().await;
            sessions.remove(&session_id);
        }

        let mut transactions = self.transactions.lock().await;
        transactions.retain(|_, tx| tx.session_id != session_id);
        Ok(())
    }

    pub async fn set_session_namespace_database(
        &self,
        session_id: &str,
        namespace: Option<String>,
        database: Option<String>,
    ) -> Result<(), BridgeError> {
        let session_id = Uuid::parse_str(session_id).map_err(map_db_error)?;
        let mut sessions = self.sessions.lock().await;
        let Some(session) = sessions.get_mut(&session_id) else {
            return Err(BridgeError::Db("session not found".to_string()));
        };

        session.namespace = namespace;
        session.database = database;
        if session.namespace.is_none() && session.database.is_none() {
            session.vars.clear();
        }
        Ok(())
    }

    pub async fn set_session_var(
        &self,
        session_id: &str,
        name: String,
        value: serde_json::Value,
    ) -> Result<(), BridgeError> {
        let session_id = Uuid::parse_str(session_id).map_err(map_db_error)?;
        let mut sessions = self.sessions.lock().await;
        let Some(session) = sessions.get_mut(&session_id) else {
            return Err(BridgeError::Db("session not found".to_string()));
        };

        session.vars.insert(name, value);
        Ok(())
    }

    pub async fn unset_session_var(&self, session_id: &str, name: &str) -> Result<(), BridgeError> {
        let session_id = Uuid::parse_str(session_id).map_err(map_db_error)?;
        let mut sessions = self.sessions.lock().await;
        let Some(session) = sessions.get_mut(&session_id) else {
            return Err(BridgeError::Db("session not found".to_string()));
        };

        session.vars.remove(name);
        Ok(())
    }

    pub async fn resolve_session_ns_db(
        &self,
        session_id: Option<String>,
    ) -> Result<(Option<String>, Option<String>), BridgeError> {
        if let Some(sid) = session_id {
            let parsed_id = Uuid::parse_str(&sid).map_err(map_db_error)?;
            let sessions = self.sessions.lock().await;
            let Some(found) = sessions.get(&parsed_id) else {
                return Err(BridgeError::Db("session not found".to_string()));
            };
            return Ok((found.namespace.clone(), found.database.clone()));
        }

        Ok((None, None))
    }

    fn next_stream_id(&self) -> String {
        format!(
            "live-{}",
            self.next_live_stream_id.fetch_add(1, Ordering::Relaxed)
        )
    }

    fn merge_session_and_query_vars(
        session: &SessionContext,
        vars: serde_json::Value,
    ) -> Result<serde_json::Value, BridgeError> {
        let mut merged = session.vars.clone();

        if !vars.is_null() {
            let Some(explicit_vars) = vars.as_object() else {
                return Err(BridgeError::Db(
                    "query vars must be an object when provided".to_string(),
                ));
            };
            for (key, value) in explicit_vars {
                merged.insert(key.clone(), value.clone());
            }
        }

        if merged.is_empty() {
            Ok(serde_json::Value::Null)
        } else {
            Ok(serde_json::Value::Object(merged))
        }
    }

    async fn run_live_subscription(
        &self,
        app_data_dir: PathBuf,
        sql: String,
        vars: serde_json::Value,
        session_id: Option<String>,
        stream_id: String,
        mut cancel_rx: broadcast::Receiver<()>,
        event_tx: mpsc::Sender<LiveSubscriptionEvent>,
    ) -> Result<(), BridgeError> {
        let db = self.ensure_initialized(&app_data_dir).await?;
        let mut stream = {
            let _guard = self.query_guard.lock().await;

            let mut session = SessionContext::default();
            if let Some(sid) = session_id {
                let parsed_id = Uuid::parse_str(&sid).map_err(map_db_error)?;
                let sessions = self.sessions.lock().await;
                let Some(found) = sessions.get(&parsed_id) else {
                    return Err(BridgeError::Db("session not found".to_string()));
                };
                session = found.clone();
            }

            if let Some(ns) = session.namespace.clone() {
                db.use_ns(ns).await.map_err(map_db_error)?;
            }
            if let Some(db_name) = session.database.clone() {
                db.use_db(db_name).await.map_err(map_db_error)?;
            }

            let effective_vars = Self::merge_session_and_query_vars(&session, vars)?;

            let mut query = db.query(sql);
            if !effective_vars.is_null() {
                query = query.bind(effective_vars);
            }

            let mut response = query.await.map_err(map_db_error)?;
            response
                .stream::<surrealdb::Notification<surrealdb::types::Value>>(())
                .map_err(map_db_error)?
        };

        if event_tx
            .send(LiveSubscriptionEvent::Started {
                stream_id: stream_id.clone(),
            })
            .await
            .is_err()
        {
            return Ok(());
        }

        loop {
            tokio::select! {
                _ = cancel_rx.recv() => {
                    let _ = event_tx.send(LiveSubscriptionEvent::Cancelled {
                        stream_id: stream_id.clone(),
                    }).await;
                    return Ok(());
                }
                next = stream.next() => {
                    match next {
                        Some(Ok(notification)) => {
                            let payload = LiveSubscriptionEvent::Notification {
                                stream_id: stream_id.clone(),
                                query_id: notification.query_id.to_string(),
                                action: format!("{:?}", notification.action),
                                data: serde_json::to_value(notification.data)
                                    .unwrap_or_else(|_| serde_json::Value::String("<non-json-value>".to_string())),
                            };

                            if event_tx.send(payload).await.is_err() {
                                return Ok(());
                            }
                        }
                        Some(Err(err)) => {
                            return Err(map_db_error(err));
                        }
                        None => {
                            let _ = event_tx.send(LiveSubscriptionEvent::Finished {
                                stream_id: stream_id.clone(),
                            }).await;
                            return Ok(());
                        }
                    }
                }
            }
        }
    }

    pub async fn start_live_subscription(
        &self,
        app_data_dir: &Path,
        sql: String,
        vars: serde_json::Value,
        session_id: Option<String>,
    ) -> Result<(String, mpsc::Receiver<LiveSubscriptionEvent>), BridgeError> {
        let stream_id = self.next_stream_id();
        let (cancel_tx, cancel_rx) = broadcast::channel(1);
        let (event_tx, event_rx) = mpsc::channel(256);

        {
            let mut live_streams = self.live_streams.lock().await;
            live_streams.insert(stream_id.clone(), cancel_tx);
        }

        let bridge = self.clone();
        let task_stream_id = stream_id.clone();
        let task_app_data_dir = app_data_dir.to_path_buf();
        tokio::spawn(async move {
            let stream_id = task_stream_id;
            let stream_id_for_error = stream_id.clone();

            let run_result = bridge
                .run_live_subscription(
                    task_app_data_dir,
                    sql,
                    vars,
                    session_id,
                    stream_id,
                    cancel_rx,
                    event_tx.clone(),
                )
                .await;

            if let Err(error) = run_result {
                let _ = event_tx
                    .send(LiveSubscriptionEvent::Failed {
                        stream_id: stream_id_for_error.clone(),
                        error: error.to_string(),
                    })
                    .await;
            }

            let mut live_streams = bridge.live_streams.lock().await;
            live_streams.remove(&stream_id_for_error);
        });

        Ok((stream_id, event_rx))
    }

    pub async fn stop_live_subscription(&self, stream_id: &str) -> Result<(), BridgeError> {
        let cancel_tx = {
            let mut live_streams = self.live_streams.lock().await;
            let Some(cancel_tx) = live_streams.remove(stream_id) else {
                return Err(BridgeError::Db("live stream not found".to_string()));
            };
            cancel_tx
        };

        let _ = cancel_tx.send(());
        Ok(())
    }

    pub async fn list_live_subscriptions(&self) -> Vec<String> {
        let live_streams = self.live_streams.lock().await;
        live_streams.keys().cloned().collect()
    }

    pub async fn begin_transaction(
        &self,
        app_data_dir: &Path,
        session_id: &str,
    ) -> Result<String, BridgeError> {
        let db = self.ensure_initialized(app_data_dir).await?;
        let _guard = self.query_guard.lock().await;
        let session_id = Uuid::parse_str(session_id).map_err(map_db_error)?;

        let session = {
            let sessions = self.sessions.lock().await;
            let Some(session) = sessions.get(&session_id) else {
                return Err(BridgeError::Db("session not found".to_string()));
            };
            session.clone()
        };

        if let Some(namespace) = session.namespace.clone() {
            db.use_ns(namespace).await.map_err(map_db_error)?;
        }
        if let Some(database) = session.database.clone() {
            db.use_db(database).await.map_err(map_db_error)?;
        }

        let tx = db.as_ref().clone().begin().await.map_err(map_db_error)?;
        let tx_id = Uuid::now_v7();

        let mut transactions = self.transactions.lock().await;
        transactions.insert(tx_id, TransactionContext { session_id, tx });
        Ok(tx_id.to_string())
    }

    pub async fn list_transactions(&self, session_id: &str) -> Result<Vec<String>, BridgeError> {
        let session_id = Uuid::parse_str(session_id).map_err(map_db_error)?;
        let transactions = self.transactions.lock().await;
        Ok(transactions
            .iter()
            .filter_map(|(tx_id, tx)| {
                if tx.session_id == session_id {
                    Some(tx_id.to_string())
                } else {
                    None
                }
            })
            .collect())
    }

    pub async fn commit_transaction(
        &self,
        session_id: &str,
        transaction_id: &str,
    ) -> Result<(), BridgeError> {
        let session_id = Uuid::parse_str(session_id).map_err(map_db_error)?;
        let transaction_id = Uuid::parse_str(transaction_id).map_err(map_db_error)?;
        let mut transactions = self.transactions.lock().await;
        let Some(tx) = transactions.remove(&transaction_id) else {
            return Err(BridgeError::Db("transaction not found".to_string()));
        };
        if tx.session_id != session_id {
            transactions.insert(transaction_id, tx);
            return Err(BridgeError::Db(
                "transaction does not belong to provided session".to_string(),
            ));
        }
        tx.tx.commit().await.map_err(map_db_error)?;
        Ok(())
    }

    pub async fn cancel_transaction(
        &self,
        session_id: &str,
        transaction_id: &str,
    ) -> Result<(), BridgeError> {
        let session_id = Uuid::parse_str(session_id).map_err(map_db_error)?;
        let transaction_id = Uuid::parse_str(transaction_id).map_err(map_db_error)?;
        let mut transactions = self.transactions.lock().await;
        let Some(tx) = transactions.remove(&transaction_id) else {
            return Err(BridgeError::Db("transaction not found".to_string()));
        };
        if tx.session_id != session_id {
            transactions.insert(transaction_id, tx);
            return Err(BridgeError::Db(
                "transaction does not belong to provided session".to_string(),
            ));
        }
        tx.tx.cancel().await.map_err(map_db_error)?;
        Ok(())
    }

    pub async fn ensure_initialized(&self, app_data_dir: &Path) -> Result<Arc<Surreal<Db>>, BridgeError> {
        let mut guard = self.inner.lock().await;

        if guard.is_none() {
            let db_dir = storage_dir(app_data_dir)?;
            let bucket_dir = files_dir(app_data_dir)?;
            std::env::set_var(
                "SURREAL_BUCKET_FOLDER_ALLOWLIST",
                bucket_dir.to_string_lossy().to_string(),
            );

            #[cfg(feature = "file-buckets")]
            let capabilities =
                Capabilities::new().with_experimental_feature_allowed(ExperimentalFeature::Files);
            #[cfg(feature = "file-buckets")]
            let config = Config::default().capabilities(capabilities);
            #[cfg(not(feature = "file-buckets"))]
            let config = Config::default();

            let endpoint = db_dir.to_string_lossy().to_string();
            let db = Surreal::new::<SurrealKv>((endpoint, config))
                .await
                .map_err(map_db_error)?;
            *guard = Some(Arc::new(db));
        }

        guard.as_ref().cloned().ok_or(BridgeError::Unavailable)
    }

    pub async fn bucket_folder_allowlist(
        &self,
        app_data_dir: &Path,
    ) -> Result<Vec<String>, BridgeError> {
        let _ = self.ensure_initialized(app_data_dir).await?;

        let raw = std::env::var("SURREAL_BUCKET_FOLDER_ALLOWLIST").map_err(map_io_error)?;
        let folders: Vec<String> = std::env::split_paths(&raw)
            .filter_map(|path| {
                let value = path.to_string_lossy().trim().to_string();
                if value.is_empty() { None } else { Some(value) }
            })
            .collect();

        if folders.is_empty() {
            return Err(BridgeError::Io(
                "SURREAL_BUCKET_FOLDER_ALLOWLIST is empty".to_string(),
            ));
        }

        Ok(folders)
    }

    pub async fn health(&self, app_data_dir: &Path) -> Result<(), BridgeError> {
        let db = self.ensure_initialized(app_data_dir).await?;
        db.health().await.map_err(map_db_error)
    }

    pub async fn version(&self, app_data_dir: &Path) -> Result<String, BridgeError> {
        let db = self.ensure_initialized(app_data_dir).await?;
        let version = db.version().await.map_err(map_db_error)?;
        Ok(version.to_string())
    }

    fn query_chunks_from_response(
        response: &mut surrealdb::method::WithStats<surrealdb::IndexedResults>,
    ) -> Vec<QueryChunk> {
        let count = response.0.num_statements();
        let mut chunks = Vec::with_capacity(count);

        for index in 0..count {
            if let Some((stats, result)) = response.take::<surrealdb::types::Value>(index) {
                match result {
                    Ok(value) => chunks.push(QueryChunk {
                        index,
                        execution_time_ms: stats.execution_time.map(|d| d.as_millis()),
                        result: Some(
                            serde_json::to_value(value)
                                .unwrap_or_else(|_| serde_json::Value::String("<non-json-value>".to_string())),
                        ),
                        error: None,
                    }),
                    Err(err) => chunks.push(QueryChunk {
                        index,
                        execution_time_ms: stats.execution_time.map(|d| d.as_millis()),
                        result: None,
                        error: Some(err.to_string()),
                    }),
                }
            }
        }

        chunks
    }

    pub async fn execute_chunks(
        &self,
        app_data_dir: &Path,
        sql: String,
        vars: serde_json::Value,
        session_id: Option<String>,
        transaction_id: Option<String>,
    ) -> Result<Vec<QueryChunk>, BridgeError> {
        let db = self.ensure_initialized(app_data_dir).await?;
        let _guard = self.query_guard.lock().await;

        let mut session = SessionContext::default();
        if let Some(sid) = session_id.clone() {
            let parsed_id = Uuid::parse_str(&sid).map_err(map_db_error)?;
            let sessions = self.sessions.lock().await;
            let Some(found) = sessions.get(&parsed_id) else {
                return Err(BridgeError::Db("session not found".to_string()));
            };
            session = found.clone();
        }

        if let Some(namespace) = session.namespace.clone() {
            db.use_ns(namespace).await.map_err(map_db_error)?;
        }
        if let Some(database) = session.database.clone() {
            db.use_db(database).await.map_err(map_db_error)?;
        }

        if let Some(tid) = transaction_id {
            let tx_id = Uuid::parse_str(&tid).map_err(map_db_error)?;

            let tx_context = {
                let mut transactions = self.transactions.lock().await;
                let Some(tx_context) = transactions.remove(&tx_id) else {
                    return Err(BridgeError::Db("transaction not found".to_string()));
                };
                tx_context
            };

            if let Some(sid) = session_id {
                let parsed_sid = match Uuid::parse_str(&sid).map_err(map_db_error) {
                    Ok(value) => value,
                    Err(err) => {
                        let mut transactions = self.transactions.lock().await;
                        transactions.insert(tx_id, tx_context);
                        return Err(err);
                    }
                };

                if tx_context.session_id != parsed_sid {
                    let mut transactions = self.transactions.lock().await;
                    transactions.insert(tx_id, tx_context);
                    return Err(BridgeError::Db(
                        "transaction does not belong to provided session".to_string(),
                    ));
                }
            }

            let effective_vars = Self::merge_session_and_query_vars(&session, vars)?;

            let mut query = tx_context.tx.query(sql);
            if !effective_vars.is_null() {
                query = query.bind(effective_vars);
            }

            let mut response = query.with_stats().await.map_err(map_db_error)?;
            let chunks = Self::query_chunks_from_response(&mut response);

            let mut transactions = self.transactions.lock().await;
            transactions.insert(tx_id, tx_context);
            Ok(chunks)
        } else {
            let effective_vars = Self::merge_session_and_query_vars(&session, vars)?;

            let mut query = db.query(sql);
            if !effective_vars.is_null() {
                query = query.bind(effective_vars);
            }

            let mut response = query.with_stats().await.map_err(map_db_error)?;
            Ok(Self::query_chunks_from_response(&mut response))
        }
    }

    pub async fn execute(
        &self,
        app_data_dir: &Path,
        sql: String,
        vars: serde_json::Value,
        session_id: Option<String>,
        transaction_id: Option<String>,
    ) -> Result<serde_json::Value, BridgeError> {
        let chunks = self
            .execute_chunks(app_data_dir, sql, vars, session_id, transaction_id)
            .await?;

        Ok(json!({ "ok": true, "chunks": chunks }))
    }
}
