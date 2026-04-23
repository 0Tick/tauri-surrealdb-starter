use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::Map as JsonMap;
use serde_json::Value as JsonValue;
use surrealdb::engine::local::{Db, SurrealKv};
use surrealdb::types::Value as SurrealValue;
use surrealdb::Surreal;
use tokio::sync::Mutex;

#[derive(Default)]
pub struct DatabaseState {
    inner: Arc<Mutex<Option<Surreal<Db>>>>,
    selected_scope: Arc<Mutex<Option<UseParams>>>,
}

#[derive(Debug, Serialize)]
pub struct ApiResponse {
    ok: bool,
    message: String,
}

#[derive(Debug, Serialize)]
pub struct VersionResponse {
    version: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UseParams {
    namespace: String,
    database: String,
}

#[derive(Debug, Deserialize)]
pub struct AuthParams {
    auth: JsonValue,
}

#[derive(Debug, Deserialize)]
pub struct TokenParams {
    token: String,
}

#[derive(Debug, Deserialize)]
pub struct ParamValueParams {
    name: String,
    value: JsonValue,
}

#[derive(Debug, Deserialize)]
pub struct NameParams {
    name: String,
}

#[derive(Debug, Deserialize)]
pub struct ResourceParams {
    resource: String,
}

#[derive(Debug, Deserialize)]
pub struct ResourceDataParams {
    resource: String,
    data: Option<JsonValue>,
}

#[derive(Debug, Deserialize)]
pub struct ResourceRequiredDataParams {
    resource: String,
    data: JsonValue,
}

#[derive(Debug, Deserialize)]
pub struct PatchParams {
    resource: String,
    diff: JsonValue,
}

#[derive(Debug, Deserialize)]
pub struct RelateParams {
    from: String,
    relation: String,
    to: String,
    data: Option<JsonValue>,
}

#[derive(Debug, Deserialize)]
pub struct RunParams {
    name: String,
    args: Option<Vec<JsonValue>>,
}

#[derive(Debug, Deserialize)]
pub struct QueryParams {
    sql: String,
    vars: Option<JsonValue>,
}

fn map_error(error: impl ToString) -> String {
    error.to_string()
}

fn is_valid_param_name(name: &str) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return false;
    };

    if !(first.is_ascii_alphabetic() || first == '_') {
        return false;
    }

    chars.all(|character| character.is_ascii_alphanumeric() || character == '_')
}

fn is_valid_function_name(name: &str) -> bool {
    !name.is_empty()
        && name.chars().all(|character| {
            character.is_ascii_alphanumeric()
                || character == '_'
                || character == ':'
                || character == '.'
        })
}

fn to_json_value(value: SurrealValue) -> Result<JsonValue, String> {
    serde_json::to_value(value).map_err(map_error)
}

fn storage_dir(app_data_dir: &Path) -> Result<PathBuf, String> {
    let db_dir = app_data_dir.join("surrealdb").join("main");
    std::fs::create_dir_all(&db_dir).map_err(map_error)?;
    Ok(db_dir)
}

async fn ensure_db(state: &DatabaseState, app_data_dir: &Path) -> Result<Surreal<Db>, String> {
    let mut guard = state.inner.lock().await;

    if guard.is_none() {
        let db_dir = storage_dir(app_data_dir)?;
        let endpoint = db_dir.to_string_lossy().to_string();
        let db = Surreal::new::<SurrealKv>(endpoint)
            .await
            .map_err(map_error)?;
        *guard = Some(db);
    }

    let db = guard
        .as_ref()
        .cloned()
        .ok_or_else(|| "database unavailable".to_string())?;

    drop(guard);

    let selected_scope = state.selected_scope.lock().await.clone();
    if let Some(scope) = selected_scope {
        db.use_ns(scope.namespace)
            .use_db(scope.database)
            .await
            .map_err(map_error)?;
    }

    Ok(db)
}

async fn execute_single_statement(
    db: &Surreal<Db>,
    sql: String,
    vars: Option<JsonValue>,
) -> Result<JsonValue, String> {
    let mut query = db.query(sql);
    if let Some(bindings) = vars {
        query = query.bind(bindings);
    }

    let mut response = query.await.map_err(map_error)?;
    if response.num_statements() == 0 {
        return Ok(JsonValue::Null);
    }

    let result: SurrealValue = response.take(0).map_err(map_error)?;
    to_json_value(result)
}

pub async fn db_connect(state: &DatabaseState, app_data_dir: &Path) -> Result<ApiResponse, String> {
    let _ = ensure_db(state, app_data_dir).await?;

    Ok(ApiResponse {
        ok: true,
        message: "connected".to_string(),
    })
}

pub async fn db_health(state: &DatabaseState, app_data_dir: &Path) -> Result<ApiResponse, String> {
    let db = ensure_db(state, app_data_dir).await?;
    db.health().await.map_err(map_error)?;

    Ok(ApiResponse {
        ok: true,
        message: "ok".to_string(),
    })
}

pub async fn db_version(
    state: &DatabaseState,
    app_data_dir: &Path,
) -> Result<VersionResponse, String> {
    let db = ensure_db(state, app_data_dir).await?;
    let version = db.version().await.map_err(map_error)?;

    Ok(VersionResponse {
        version: version.to_string(),
    })
}

pub async fn db_use(
    state: &DatabaseState,
    app_data_dir: &Path,
    params: UseParams,
) -> Result<ApiResponse, String> {
    let db = ensure_db(state, app_data_dir).await?;

    db.use_ns(params.namespace.clone())
        .use_db(params.database.clone())
        .await
        .map_err(map_error)?;

    let mut selected_scope = state.selected_scope.lock().await;
    *selected_scope = Some(params);

    Ok(ApiResponse {
        ok: true,
        message: "namespace/database selected".to_string(),
    })
}

pub async fn db_signin(
    state: &DatabaseState,
    app_data_dir: &Path,
    params: AuthParams,
) -> Result<JsonValue, String> {
    let db = ensure_db(state, app_data_dir).await?;
    execute_single_statement(
        &db,
        "SIGNIN $auth;".to_string(),
        Some(JsonValue::Object(JsonMap::from_iter([(
            "auth".to_string(),
            params.auth,
        )]))),
    )
    .await
}

pub async fn db_signup(
    state: &DatabaseState,
    app_data_dir: &Path,
    params: AuthParams,
) -> Result<JsonValue, String> {
    let db = ensure_db(state, app_data_dir).await?;
    execute_single_statement(
        &db,
        "SIGNUP $auth;".to_string(),
        Some(JsonValue::Object(JsonMap::from_iter([(
            "auth".to_string(),
            params.auth,
        )]))),
    )
    .await
}

pub async fn db_authenticate(
    state: &DatabaseState,
    app_data_dir: &Path,
    params: TokenParams,
) -> Result<ApiResponse, String> {
    let db = ensure_db(state, app_data_dir).await?;

    execute_single_statement(
        &db,
        "AUTHENTICATE $token;".to_string(),
        Some(JsonValue::Object(JsonMap::from_iter([(
            "token".to_string(),
            JsonValue::String(params.token),
        )]))),
    )
    .await?;

    Ok(ApiResponse {
        ok: true,
        message: "authenticated".to_string(),
    })
}

pub async fn db_invalidate(
    state: &DatabaseState,
    app_data_dir: &Path,
) -> Result<ApiResponse, String> {
    let db = ensure_db(state, app_data_dir).await?;
    execute_single_statement(&db, "INVALIDATE;".to_string(), None).await?;

    Ok(ApiResponse {
        ok: true,
        message: "invalidated".to_string(),
    })
}

pub async fn db_let(
    state: &DatabaseState,
    app_data_dir: &Path,
    params: ParamValueParams,
) -> Result<ApiResponse, String> {
    if !is_valid_param_name(&params.name) {
        return Err(format!("invalid parameter name: {}", params.name));
    }

    let db = ensure_db(state, app_data_dir).await?;
    let sql = format!("LET ${} = $value;", params.name);
    execute_single_statement(
        &db,
        sql,
        Some(JsonValue::Object(JsonMap::from_iter([(
            "value".to_string(),
            params.value,
        )]))),
    )
    .await?;

    Ok(ApiResponse {
        ok: true,
        message: "param set".to_string(),
    })
}

pub async fn db_unset(
    state: &DatabaseState,
    app_data_dir: &Path,
    params: NameParams,
) -> Result<ApiResponse, String> {
    if !is_valid_param_name(&params.name) {
        return Err(format!("invalid parameter name: {}", params.name));
    }

    let db = ensure_db(state, app_data_dir).await?;
    let sql = format!("REMOVE PARAM ${};", params.name);
    if let Err(error) = execute_single_statement(&db, sql, None).await {
        let missing_param = format!("The param '${}' does not exist", params.name);
        if !error.contains(&missing_param) {
            return Err(error);
        }
    }

    Ok(ApiResponse {
        ok: true,
        message: "param removed".to_string(),
    })
}

pub async fn db_info(state: &DatabaseState, app_data_dir: &Path) -> Result<JsonValue, String> {
    let db = ensure_db(state, app_data_dir).await?;
    execute_single_statement(&db, "INFO FOR DB;".to_string(), None).await
}

pub async fn db_select(
    state: &DatabaseState,
    app_data_dir: &Path,
    params: ResourceParams,
) -> Result<JsonValue, String> {
    let db = ensure_db(state, app_data_dir).await?;
    let sql = format!("SELECT * FROM {};", params.resource);
    execute_single_statement(&db, sql, None).await
}

pub async fn db_create(
    state: &DatabaseState,
    app_data_dir: &Path,
    params: ResourceDataParams,
) -> Result<JsonValue, String> {
    let db = ensure_db(state, app_data_dir).await?;
    let sql = if params.data.is_some() {
        format!("CREATE {} CONTENT $data RETURN AFTER;", params.resource)
    } else {
        format!("CREATE {} RETURN AFTER;", params.resource)
    };

    let vars = params
        .data
        .map(|data| JsonValue::Object(JsonMap::from_iter([("data".to_string(), data)])));
    execute_single_statement(&db, sql, vars).await
}

pub async fn db_insert(
    state: &DatabaseState,
    app_data_dir: &Path,
    params: ResourceRequiredDataParams,
) -> Result<JsonValue, String> {
    let db = ensure_db(state, app_data_dir).await?;
    let sql = format!("INSERT INTO {} $data RETURN AFTER;", params.resource);

    execute_single_statement(
        &db,
        sql,
        Some(JsonValue::Object(JsonMap::from_iter([(
            "data".to_string(),
            params.data,
        )]))),
    )
    .await
}

pub async fn db_update(
    state: &DatabaseState,
    app_data_dir: &Path,
    params: ResourceDataParams,
) -> Result<JsonValue, String> {
    let db = ensure_db(state, app_data_dir).await?;
    let sql = if params.data.is_some() {
        format!("UPDATE {} CONTENT $data RETURN AFTER;", params.resource)
    } else {
        format!("UPDATE {} RETURN AFTER;", params.resource)
    };

    let vars = params
        .data
        .map(|data| JsonValue::Object(JsonMap::from_iter([("data".to_string(), data)])));
    execute_single_statement(&db, sql, vars).await
}

pub async fn db_upsert(
    state: &DatabaseState,
    app_data_dir: &Path,
    params: ResourceDataParams,
) -> Result<JsonValue, String> {
    let db = ensure_db(state, app_data_dir).await?;
    let sql = if params.data.is_some() {
        format!("UPSERT {} CONTENT $data RETURN AFTER;", params.resource)
    } else {
        format!("UPSERT {} RETURN AFTER;", params.resource)
    };

    let vars = params
        .data
        .map(|data| JsonValue::Object(JsonMap::from_iter([("data".to_string(), data)])));
    execute_single_statement(&db, sql, vars).await
}

pub async fn db_merge(
    state: &DatabaseState,
    app_data_dir: &Path,
    params: ResourceRequiredDataParams,
) -> Result<JsonValue, String> {
    let db = ensure_db(state, app_data_dir).await?;
    let sql = format!("UPDATE {} MERGE $data RETURN AFTER;", params.resource);

    execute_single_statement(
        &db,
        sql,
        Some(JsonValue::Object(JsonMap::from_iter([(
            "data".to_string(),
            params.data,
        )]))),
    )
    .await
}

pub async fn db_patch(
    state: &DatabaseState,
    app_data_dir: &Path,
    params: PatchParams,
) -> Result<JsonValue, String> {
    let db = ensure_db(state, app_data_dir).await?;
    let sql = format!("UPDATE {} PATCH $diff RETURN AFTER;", params.resource);

    execute_single_statement(
        &db,
        sql,
        Some(JsonValue::Object(JsonMap::from_iter([(
            "diff".to_string(),
            params.diff,
        )]))),
    )
    .await
}

pub async fn db_delete(
    state: &DatabaseState,
    app_data_dir: &Path,
    params: ResourceParams,
) -> Result<JsonValue, String> {
    let db = ensure_db(state, app_data_dir).await?;
    let sql = format!("DELETE {} RETURN BEFORE;", params.resource);
    execute_single_statement(&db, sql, None).await
}

pub async fn db_relate(
    state: &DatabaseState,
    app_data_dir: &Path,
    params: RelateParams,
) -> Result<JsonValue, String> {
    let db = ensure_db(state, app_data_dir).await?;
    let sql = if params.data.is_some() {
        format!(
            "RELATE {}->{}->{} CONTENT $data RETURN AFTER;",
            params.from, params.relation, params.to
        )
    } else {
        format!(
            "RELATE {}->{}->{} RETURN AFTER;",
            params.from, params.relation, params.to
        )
    };

    let vars = params
        .data
        .map(|data| JsonValue::Object(JsonMap::from_iter([("data".to_string(), data)])));
    execute_single_statement(&db, sql, vars).await
}

pub async fn db_run(
    state: &DatabaseState,
    app_data_dir: &Path,
    params: RunParams,
) -> Result<JsonValue, String> {
    if !is_valid_function_name(&params.name) {
        return Err(format!("invalid function name: {}", params.name));
    }

    let db = ensure_db(state, app_data_dir).await?;
    let args = params.args.unwrap_or_default();

    let mut vars = JsonMap::new();
    let mut arg_refs = Vec::with_capacity(args.len());
    for (index, argument) in args.into_iter().enumerate() {
        let key = format!("arg{index}");
        arg_refs.push(format!("${key}"));
        vars.insert(key, argument);
    }

    let sql = format!("RETURN {}({});", params.name, arg_refs.join(", "));
    let bindings = if vars.is_empty() {
        None
    } else {
        Some(JsonValue::Object(vars))
    };

    execute_single_statement(&db, sql, bindings).await
}

pub async fn db_query(
    state: &DatabaseState,
    app_data_dir: &Path,
    params: QueryParams,
) -> Result<JsonValue, String> {
    let db = ensure_db(state, app_data_dir).await?;

    let mut query = db.query(params.sql);
    if let Some(vars) = params.vars {
        query = query.bind(vars);
    }

    let mut response = query.await.map_err(map_error)?;
    let statement_count = response.num_statements();

    let mut all_results = Vec::with_capacity(statement_count);
    for statement_index in 0..statement_count {
        let result: SurrealValue = response.take(statement_index).map_err(map_error)?;
        all_results.push(to_json_value(result)?);
    }

    Ok(JsonValue::Array(all_results))
}

pub async fn db_close(state: &DatabaseState) -> Result<ApiResponse, String> {
    let mut guard = state.inner.lock().await;
    *guard = None;
    drop(guard);

    let mut selected_scope = state.selected_scope.lock().await;
    *selected_scope = None;

    Ok(ApiResponse {
        ok: true,
        message: "closed".to_string(),
    })
}
