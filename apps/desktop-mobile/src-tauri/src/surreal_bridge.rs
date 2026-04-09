use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use surrealdb::engine::local::{Db, SurrealKv};
use surrealdb::Surreal;
use surrealdb::Value as SurrealValue;
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;

#[derive(Default)]
pub struct DatabaseState {
    inner: Arc<Mutex<Option<Surreal<Db>>>>,
}

#[derive(Debug, Serialize)]
pub struct ApiResponse {
    ok: bool,
    message: String,
}

#[derive(Debug, Deserialize)]
pub struct UseParams {
    namespace: String,
    database: String,
}

#[derive(Debug, Deserialize)]
pub struct SigninParams {
    username: Option<String>,
    password: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct QueryParams {
    sql: String,
    vars: Option<JsonValue>,
}

fn map_error(error: impl ToString) -> String {
    error.to_string()
}

fn storage_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let app_data = app.path().app_data_dir().map_err(map_error)?;
    let db_dir = app_data.join("surrealdb").join("main");
    std::fs::create_dir_all(&db_dir).map_err(map_error)?;
    Ok(db_dir)
}

async fn ensure_db(
    state: &State<'_, DatabaseState>,
    app: &AppHandle,
) -> Result<Surreal<Db>, String> {
    let mut guard = state.inner.lock().await;

    if guard.is_none() {
        let db_dir = storage_dir(app)?;
        let endpoint = db_dir.to_string_lossy().to_string();
        let db = Surreal::new::<SurrealKv>(endpoint)
            .await
            .map_err(map_error)?;
        *guard = Some(db);
    }

    guard
        .as_ref()
        .cloned()
        .ok_or_else(|| "database unavailable".to_string())
}

#[tauri::command]
pub async fn db_connect(
    app: tauri::AppHandle,
    state: State<'_, DatabaseState>,
) -> Result<ApiResponse, String> {
    let _ = ensure_db(&state, &app).await?;

    Ok(ApiResponse {
        ok: true,
        message: "connected".to_string(),
    })
}

#[tauri::command]
pub async fn db_health(
    app: tauri::AppHandle,
    state: State<'_, DatabaseState>,
) -> Result<ApiResponse, String> {
    let _ = ensure_db(&state, &app).await?;

    Ok(ApiResponse {
        ok: true,
        message: "ok".to_string(),
    })
}

#[tauri::command]
pub async fn db_use(
    app: tauri::AppHandle,
    state: State<'_, DatabaseState>,
    params: UseParams,
) -> Result<ApiResponse, String> {
    let db = ensure_db(&state, &app).await?;

    db.use_ns(params.namespace)
        .use_db(params.database)
        .await
        .map_err(map_error)?;

    Ok(ApiResponse {
        ok: true,
        message: "namespace/database selected".to_string(),
    })
}

#[tauri::command]
pub async fn db_signin(
    app: tauri::AppHandle,
    state: State<'_, DatabaseState>,
    params: SigninParams,
) -> Result<ApiResponse, String> {
    let _ = ensure_db(&state, &app).await?;

    let username = params.username.unwrap_or_else(|| "embedded".to_string());
    let password = params.password.unwrap_or_else(|| "embedded".to_string());

    Ok(ApiResponse {
        ok: true,
        message: format!("signin accepted for {username} ({})", password.len()),
    })
}

#[tauri::command]
pub async fn db_query(
    app: tauri::AppHandle,
    state: State<'_, DatabaseState>,
    params: QueryParams,
) -> Result<JsonValue, String> {
    let db = ensure_db(&state, &app).await?;

    let mut query = db.query(params.sql);
    if let Some(vars) = params.vars {
        query = query.bind(vars);
    }

    let mut response = query.await.map_err(map_error)?;
    let statement_count = response.num_statements();

    if statement_count == 0 {
        return Ok(JsonValue::Null);
    }

    if statement_count == 1 {
        let result: SurrealValue = response.take(0).map_err(map_error)?;
        let json = serde_json::to_value(result).map_err(map_error)?;
        return Ok(json);
    }

    let mut all_results = Vec::with_capacity(statement_count);
    for statement_index in 0..statement_count {
        let result: SurrealValue = response.take(statement_index).map_err(map_error)?;
        all_results.push(serde_json::to_value(result).map_err(map_error)?);
    }

    Ok(JsonValue::Array(all_results))
}

#[tauri::command]
pub async fn db_close(state: State<'_, DatabaseState>) -> Result<ApiResponse, String> {
    let mut guard = state.inner.lock().await;
    *guard = None;

    Ok(ApiResponse {
        ok: true,
        message: "closed".to_string(),
    })
}
