use std::sync::Arc;

use surrealdb_core::rpc::RpcProtocol;
use tauri::Manager;
use tauri::ipc::Channel;

use crate::error::{BridgeError, map_db_error, map_io_error};
use crate::state::{BridgeChannelMessage, BridgeState, RpcConnection};

#[tauri::command]
pub async fn surreal_bridge_connect(
    app: tauri::AppHandle,
    on_message: Channel<BridgeChannelMessage>,
) -> Result<u32, BridgeError> {
    let app_data_dir = app.path().app_data_dir().map_err(map_io_error)?;
    let state = app.state::<BridgeState>();
    let core = state.ensure_initialized(&app_data_dir).await?;

    let id = state.next_connection_id();
    let connection = Arc::new(RpcConnection::new(
        id,
        core.datastore.clone(),
        core.shared.clone(),
        on_message,
    ));

    core.shared.connections.insert(id, connection);
    Ok(id)
}

#[tauri::command]
pub async fn surreal_bridge_send(
    app: tauri::AppHandle,
    id: u32,
    data: Vec<u8>,
) -> Result<(), BridgeError> {
    let app_data_dir = app.path().app_data_dir().map_err(map_io_error)?;
    let state = app.state::<BridgeState>();
    let core = state.ensure_initialized(&app_data_dir).await?;

    let Some(connection) = core.shared.connections.get(&id) else {
        return Err(BridgeError::ConnectionNotFound(id));
    };

    let connection = connection.value().clone();
    state
        .run_on_runtime(async move { connection.process_payload(data).await })
        .await
}

#[tauri::command]
pub async fn surreal_bridge_disconnect(app: tauri::AppHandle, id: u32) -> Result<(), BridgeError> {
    let app_data_dir = app.path().app_data_dir().map_err(map_io_error)?;
    let state = app.state::<BridgeState>();
    let core = state.ensure_initialized(&app_data_dir).await?;

    let Some((_, connection)) = core.shared.connections.remove(&id) else {
        return Err(BridgeError::ConnectionNotFound(id));
    };

    state
        .run_on_runtime(async move {
            connection.cleanup_all_lqs().await;
            Ok(())
        })
        .await
}

#[tauri::command]
pub async fn surreal_bridge_bucket_folder_allowlist(
    app: tauri::AppHandle,
) -> Result<Vec<String>, BridgeError> {
    let app_data_dir = app.path().app_data_dir().map_err(map_io_error)?;
    let state = app.state::<BridgeState>();

    state.ensure_initialized(&app_data_dir).await?;
    state.bucket_folder_allowlist()
}

#[tauri::command]
pub async fn surreal_bridge_health(app: tauri::AppHandle) -> Result<(), BridgeError> {
    let app_data_dir = app.path().app_data_dir().map_err(map_io_error)?;
    let state = app.state::<BridgeState>();
    let core = state.ensure_initialized(&app_data_dir).await?;
    let datastore = core.datastore.clone();

    state
        .run_on_runtime(async move {
            let tx = datastore
                .transaction(
                    surrealdb_core::kvs::TransactionType::Read,
                    surrealdb_core::kvs::LockType::Optimistic,
                )
                .await
                .map_err(map_db_error)?;

            tx.cancel().await.map_err(map_db_error)?;
            Ok(())
        })
        .await
}