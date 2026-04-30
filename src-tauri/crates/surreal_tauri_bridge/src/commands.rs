use std::fmt::Display;

use serde_json::Value;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

use crate::{BridgeError, EmbeddedBridge, LiveSubscriptionEvent, QueryChunk};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiError {
    code: &'static str,
    message: String,
}

impl ApiError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

impl From<BridgeError> for ApiError {
    fn from(value: BridgeError) -> Self {
        match value {
            BridgeError::Io(message) => Self::new("BRIDGE_IO", message),
            BridgeError::Db(message) => Self::new("BRIDGE_DB", message),
            BridgeError::Unavailable => Self::new("BRIDGE_UNAVAILABLE", "database unavailable"),
        }
    }
}

fn app_path_error<E: Display>(err: E) -> ApiError {
    ApiError::new("APP_PATH", err.to_string())
}

fn ipc_send_error<E: Display>(err: E) -> ApiError {
    ApiError::new("IPC_SEND", err.to_string())
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
pub enum DbQueryStreamEvent {
    Started { total_chunks: usize },
    Chunk { chunk: QueryChunk },
    Finished,
    Failed { error: String },
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
pub enum DbLiveStreamEvent {
    Started,
    Notification {
        query_id: String,
        action: String,
        data: Value,
    },
    Finished,
    Failed { error: String },
}

pub type DbLiveSubscriptionEvent = LiveSubscriptionEvent;

#[tauri::command]
pub async fn db_init<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, EmbeddedBridge>,
) -> Result<(), ApiError> {
    let app_data_dir = app.path().app_data_dir().map_err(app_path_error)?;
    state
        .ensure_initialized(&app_data_dir)
        .await
        .map_err(ApiError::from)?;
    Ok(())
}

#[tauri::command]
pub async fn db_health<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, EmbeddedBridge>,
) -> Result<(), ApiError> {
    let app_data_dir = app.path().app_data_dir().map_err(app_path_error)?;
    state
        .health(&app_data_dir)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn db_version<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, EmbeddedBridge>,
) -> Result<String, ApiError> {
    let app_data_dir = app.path().app_data_dir().map_err(app_path_error)?;
    state
        .version(&app_data_dir)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn db_bucket_folder_allowlist<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, EmbeddedBridge>,
) -> Result<Vec<String>, ApiError> {
    let app_data_dir = app.path().app_data_dir().map_err(app_path_error)?;
    state
        .bucket_folder_allowlist(&app_data_dir)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn db_query<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, EmbeddedBridge>,
    sql: String,
    vars: Option<Value>,
    session_id: Option<String>,
    transaction_id: Option<String>,
) -> Result<Value, ApiError> {
    let app_data_dir = app.path().app_data_dir().map_err(app_path_error)?;
    let vars = vars.unwrap_or(Value::Null);
    state
        .execute(&app_data_dir, sql, vars, session_id, transaction_id)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn db_new_session(state: State<'_, EmbeddedBridge>) -> Result<String, ApiError> {
    Ok(state.new_session().await)
}

#[tauri::command]
pub async fn db_list_sessions(state: State<'_, EmbeddedBridge>) -> Result<Vec<String>, ApiError> {
    Ok(state.list_sessions().await)
}

#[tauri::command]
pub async fn db_drop_session(
    state: State<'_, EmbeddedBridge>,
    session_id: String,
) -> Result<(), ApiError> {
    state.drop_session(&session_id).await.map_err(ApiError::from)
}

#[tauri::command]
pub async fn db_use_session(
    state: State<'_, EmbeddedBridge>,
    session_id: String,
    namespace: Option<String>,
    database: Option<String>,
) -> Result<(), ApiError> {
    state
        .set_session_namespace_database(&session_id, namespace, database)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn db_set_session_var(
    state: State<'_, EmbeddedBridge>,
    session_id: String,
    name: String,
    value: Value,
) -> Result<(), ApiError> {
    state
        .set_session_var(&session_id, name, value)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn db_unset_session_var(
    state: State<'_, EmbeddedBridge>,
    session_id: String,
    name: String,
) -> Result<(), ApiError> {
    state
        .unset_session_var(&session_id, &name)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn db_begin_transaction<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, EmbeddedBridge>,
    session_id: String,
) -> Result<String, ApiError> {
    let app_data_dir = app.path().app_data_dir().map_err(app_path_error)?;
    state
        .begin_transaction(&app_data_dir, &session_id)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn db_list_transactions(
    state: State<'_, EmbeddedBridge>,
    session_id: String,
) -> Result<Vec<String>, ApiError> {
    state
        .list_transactions(&session_id)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn db_commit_transaction(
    state: State<'_, EmbeddedBridge>,
    session_id: String,
    transaction_id: String,
) -> Result<(), ApiError> {
    state
        .commit_transaction(&session_id, &transaction_id)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn db_cancel_transaction(
    state: State<'_, EmbeddedBridge>,
    session_id: String,
    transaction_id: String,
) -> Result<(), ApiError> {
    state
        .cancel_transaction(&session_id, &transaction_id)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn db_query_stream<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, EmbeddedBridge>,
    sql: String,
    vars: Option<Value>,
    session_id: Option<String>,
    transaction_id: Option<String>,
    on_event: Channel<DbQueryStreamEvent>,
) -> Result<(), ApiError> {
    let app_data_dir = app.path().app_data_dir().map_err(app_path_error)?;
    let vars = vars.unwrap_or(Value::Null);

    match state
        .execute_chunks(&app_data_dir, sql, vars, session_id, transaction_id)
        .await
    {
        Ok(chunks) => {
            on_event
                .send(DbQueryStreamEvent::Started {
                    total_chunks: chunks.len(),
                })
                .map_err(ipc_send_error)?;

            for chunk in chunks {
                on_event
                    .send(DbQueryStreamEvent::Chunk { chunk })
                    .map_err(ipc_send_error)?;
            }

            on_event
                .send(DbQueryStreamEvent::Finished)
                .map_err(ipc_send_error)?;
            Ok(())
        }
        Err(err) => {
            let api_error = ApiError::from(err);
            on_event
                .send(DbQueryStreamEvent::Failed {
                    error: api_error.message.clone(),
                })
                .map_err(ipc_send_error)?;
            Err(api_error)
        }
    }
}

#[tauri::command]
pub async fn db_live_query_stream<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, EmbeddedBridge>,
    sql: String,
    vars: Option<Value>,
    session_id: Option<String>,
    on_event: Channel<DbLiveStreamEvent>,
) -> Result<(), ApiError> {
    let app_data_dir = app.path().app_data_dir().map_err(app_path_error)?;
    let vars = vars.unwrap_or(Value::Null);
    let (_stream_id, mut stream_events) = state
        .start_live_subscription(&app_data_dir, sql, vars, session_id)
        .await
        .map_err(ApiError::from)?;

    while let Some(event) = stream_events.recv().await {
        match event {
            LiveSubscriptionEvent::Started { .. } => {
                if on_event.send(DbLiveStreamEvent::Started).is_err() {
                    return Ok(());
                }
            }
            LiveSubscriptionEvent::Notification {
                query_id,
                action,
                data,
                ..
            } => {
                if on_event
                    .send(DbLiveStreamEvent::Notification {
                        query_id,
                        action,
                        data,
                    })
                    .is_err()
                {
                    return Ok(());
                }
            }
            LiveSubscriptionEvent::Finished { .. } | LiveSubscriptionEvent::Cancelled { .. } => {
                let _ = on_event.send(DbLiveStreamEvent::Finished);
                return Ok(());
            }
            LiveSubscriptionEvent::Failed { error, .. } => {
                let _ = on_event.send(DbLiveStreamEvent::Failed {
                    error: error.clone(),
                });
                return Err(ApiError::new("BRIDGE_DB", error));
            }
        }
    }

    let _ = on_event.send(DbLiveStreamEvent::Finished);
    Ok(())
}

#[tauri::command]
pub async fn db_live_subscribe<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, EmbeddedBridge>,
    sql: String,
    vars: Option<Value>,
    session_id: Option<String>,
    on_event: Channel<DbLiveSubscriptionEvent>,
) -> Result<String, ApiError> {
    let app_data_dir = app.path().app_data_dir().map_err(app_path_error)?;
    let vars = vars.unwrap_or(Value::Null);
    let (stream_id, mut stream_events) = state
        .start_live_subscription(&app_data_dir, sql, vars, session_id)
        .await
        .map_err(ApiError::from)?;

    tauri::async_runtime::spawn(async move {
        while let Some(event) = stream_events.recv().await {
            if on_event.send(event).is_err() {
                break;
            }
        }
    });

    Ok(stream_id)
}

#[tauri::command]
pub async fn db_live_unsubscribe(
    state: State<'_, EmbeddedBridge>,
    stream_id: String,
) -> Result<(), ApiError> {
    state
        .stop_live_subscription(&stream_id)
        .await
        .map_err(ApiError::from)
}

#[tauri::command]
pub async fn db_list_live_streams(
    state: State<'_, EmbeddedBridge>,
) -> Result<Vec<String>, ApiError> {
    Ok(state.list_live_subscriptions().await)
}
