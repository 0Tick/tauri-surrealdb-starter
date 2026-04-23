use std::path::PathBuf;

use serde_json::Value as JsonValue;
use surrealdb_bridge as db_bridge;
use tauri::{AppHandle, Manager, State};

pub use db_bridge::DatabaseState;

fn map_error(error: impl ToString) -> String {
    error.to_string()
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(map_error)
}

#[tauri::command]
pub async fn db_connect(
    app: tauri::AppHandle,
    state: State<'_, DatabaseState>,
) -> Result<db_bridge::ApiResponse, String> {
    let app_data = app_data_dir(&app)?;
    db_bridge::db_connect(&state, &app_data).await
}

#[tauri::command]
pub async fn db_health(
    app: tauri::AppHandle,
    state: State<'_, DatabaseState>,
) -> Result<db_bridge::ApiResponse, String> {
    let app_data = app_data_dir(&app)?;
    db_bridge::db_health(&state, &app_data).await
}

#[tauri::command]
pub async fn db_version(
    app: tauri::AppHandle,
    state: State<'_, DatabaseState>,
) -> Result<db_bridge::VersionResponse, String> {
    let app_data = app_data_dir(&app)?;
    db_bridge::db_version(&state, &app_data).await
}

#[tauri::command]
pub async fn db_use(
    app: tauri::AppHandle,
    state: State<'_, DatabaseState>,
    params: db_bridge::UseParams,
) -> Result<db_bridge::ApiResponse, String> {
    let app_data = app_data_dir(&app)?;
    db_bridge::db_use(&state, &app_data, params).await
}

#[tauri::command]
pub async fn db_signin(
    app: tauri::AppHandle,
    state: State<'_, DatabaseState>,
    params: db_bridge::AuthParams,
) -> Result<JsonValue, String> {
    let app_data = app_data_dir(&app)?;
    db_bridge::db_signin(&state, &app_data, params).await
}

#[tauri::command]
pub async fn db_signup(
    app: tauri::AppHandle,
    state: State<'_, DatabaseState>,
    params: db_bridge::AuthParams,
) -> Result<JsonValue, String> {
    let app_data = app_data_dir(&app)?;
    db_bridge::db_signup(&state, &app_data, params).await
}

#[tauri::command]
pub async fn db_authenticate(
    app: tauri::AppHandle,
    state: State<'_, DatabaseState>,
    params: db_bridge::TokenParams,
) -> Result<db_bridge::ApiResponse, String> {
    let app_data = app_data_dir(&app)?;
    db_bridge::db_authenticate(&state, &app_data, params).await
}

#[tauri::command]
pub async fn db_invalidate(
    app: tauri::AppHandle,
    state: State<'_, DatabaseState>,
) -> Result<db_bridge::ApiResponse, String> {
    let app_data = app_data_dir(&app)?;
    db_bridge::db_invalidate(&state, &app_data).await
}

#[tauri::command]
pub async fn db_let(
    app: tauri::AppHandle,
    state: State<'_, DatabaseState>,
    params: db_bridge::ParamValueParams,
) -> Result<db_bridge::ApiResponse, String> {
    let app_data = app_data_dir(&app)?;
    db_bridge::db_let(&state, &app_data, params).await
}

#[tauri::command]
pub async fn db_unset(
    app: tauri::AppHandle,
    state: State<'_, DatabaseState>,
    params: db_bridge::NameParams,
) -> Result<db_bridge::ApiResponse, String> {
    let app_data = app_data_dir(&app)?;
    db_bridge::db_unset(&state, &app_data, params).await
}

#[tauri::command]
pub async fn db_info(
    app: tauri::AppHandle,
    state: State<'_, DatabaseState>,
) -> Result<JsonValue, String> {
    let app_data = app_data_dir(&app)?;
    db_bridge::db_info(&state, &app_data).await
}

#[tauri::command]
pub async fn db_select(
    app: tauri::AppHandle,
    state: State<'_, DatabaseState>,
    params: db_bridge::ResourceParams,
) -> Result<JsonValue, String> {
    let app_data = app_data_dir(&app)?;
    db_bridge::db_select(&state, &app_data, params).await
}

#[tauri::command]
pub async fn db_create(
    app: tauri::AppHandle,
    state: State<'_, DatabaseState>,
    params: db_bridge::ResourceDataParams,
) -> Result<JsonValue, String> {
    let app_data = app_data_dir(&app)?;
    db_bridge::db_create(&state, &app_data, params).await
}

#[tauri::command]
pub async fn db_insert(
    app: tauri::AppHandle,
    state: State<'_, DatabaseState>,
    params: db_bridge::ResourceRequiredDataParams,
) -> Result<JsonValue, String> {
    let app_data = app_data_dir(&app)?;
    db_bridge::db_insert(&state, &app_data, params).await
}

#[tauri::command]
pub async fn db_update(
    app: tauri::AppHandle,
    state: State<'_, DatabaseState>,
    params: db_bridge::ResourceDataParams,
) -> Result<JsonValue, String> {
    let app_data = app_data_dir(&app)?;
    db_bridge::db_update(&state, &app_data, params).await
}

#[tauri::command]
pub async fn db_upsert(
    app: tauri::AppHandle,
    state: State<'_, DatabaseState>,
    params: db_bridge::ResourceDataParams,
) -> Result<JsonValue, String> {
    let app_data = app_data_dir(&app)?;
    db_bridge::db_upsert(&state, &app_data, params).await
}

#[tauri::command]
pub async fn db_merge(
    app: tauri::AppHandle,
    state: State<'_, DatabaseState>,
    params: db_bridge::ResourceRequiredDataParams,
) -> Result<JsonValue, String> {
    let app_data = app_data_dir(&app)?;
    db_bridge::db_merge(&state, &app_data, params).await
}

#[tauri::command]
pub async fn db_patch(
    app: tauri::AppHandle,
    state: State<'_, DatabaseState>,
    params: db_bridge::PatchParams,
) -> Result<JsonValue, String> {
    let app_data = app_data_dir(&app)?;
    db_bridge::db_patch(&state, &app_data, params).await
}

#[tauri::command]
pub async fn db_delete(
    app: tauri::AppHandle,
    state: State<'_, DatabaseState>,
    params: db_bridge::ResourceParams,
) -> Result<JsonValue, String> {
    let app_data = app_data_dir(&app)?;
    db_bridge::db_delete(&state, &app_data, params).await
}

#[tauri::command]
pub async fn db_relate(
    app: tauri::AppHandle,
    state: State<'_, DatabaseState>,
    params: db_bridge::RelateParams,
) -> Result<JsonValue, String> {
    let app_data = app_data_dir(&app)?;
    db_bridge::db_relate(&state, &app_data, params).await
}

#[tauri::command]
pub async fn db_run(
    app: tauri::AppHandle,
    state: State<'_, DatabaseState>,
    params: db_bridge::RunParams,
) -> Result<JsonValue, String> {
    let app_data = app_data_dir(&app)?;
    db_bridge::db_run(&state, &app_data, params).await
}

#[tauri::command]
pub async fn db_query(
    app: tauri::AppHandle,
    state: State<'_, DatabaseState>,
    params: db_bridge::QueryParams,
) -> Result<JsonValue, String> {
    let app_data = app_data_dir(&app)?;
    db_bridge::db_query(&state, &app_data, params).await
}

#[tauri::command]
pub async fn db_close(state: State<'_, DatabaseState>) -> Result<db_bridge::ApiResponse, String> {
    db_bridge::db_close(&state).await
}

