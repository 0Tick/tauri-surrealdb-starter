// src-tauri/src/lib.rs
//
// Tauri application library.
//
// Architecture
// ────────────
// • One embedded SurrealDB instance is opened at startup and kept alive for
//   the entire lifetime of the application (global single-session approach).
// • A single Tauri command `rpc` accepts a JSON-RPC-style request string and
//   returns a JSON-RPC-style response string.  The JS side uses the
//   @tauri-surrealdb-starter/transport package to call this command.
//
// Supported RPC methods
// ─────────────────────
//   use(namespace, database)          – switch active namespace / database
//   query(sql [, vars])               – run SurrealQL, returns array of results
//   select(thing)                     – SELECT * FROM <thing>
//   create(thing [, data])            – CREATE <thing> CONTENT <data>
//   update(thing, data)               – UPDATE <thing> CONTENT <data>
//   merge(thing, data)                – UPDATE <thing> MERGE <data>
//   delete(thing)                     – DELETE <thing>

use serde::{Deserialize, Serialize};
use surrealdb::engine::local::{Db, SurrealKv};
use surrealdb::{Surreal, Value as SurrealValue};
use tauri::{Manager, State};

// ─────────────────────────────────────────────────────────────────────────────
// Application state
// ─────────────────────────────────────────────────────────────────────────────

/// Holds the embedded SurrealDB connection.
///
/// `Surreal<Db>` is internally reference-counted (`Arc`) and `Clone + Send +
/// Sync`, so it is safe to share across async Tauri commands without an extra
/// `Mutex`.
pub struct AppState {
    pub db: Surreal<Db>,
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON-RPC request / response types
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct RpcRequest {
    id: serde_json::Value,
    method: String,
    #[serde(default = "default_params")]
    params: Vec<serde_json::Value>,
}

fn default_params() -> Vec<serde_json::Value> {
    vec![]
}

#[derive(Debug, Serialize)]
struct RpcResponse {
    id: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<RpcError>,
}

#[derive(Debug, Serialize)]
struct RpcError {
    code: i64,
    message: String,
}

impl RpcResponse {
    fn ok(id: serde_json::Value, result: serde_json::Value) -> Self {
        Self {
            id,
            result: Some(result),
            error: None,
        }
    }

    fn err(id: serde_json::Value, code: i64, message: impl Into<String>) -> Self {
        Self {
            id,
            result: None,
            error: Some(RpcError {
                code,
                message: message.into(),
            }),
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// RPC method handlers
// ─────────────────────────────────────────────────────────────────────────────

/// Dispatch a parsed RPC request against the SurrealDB instance.
async fn dispatch(db: &Surreal<Db>, req: RpcRequest) -> RpcResponse {
    let id = req.id.clone();

    match req.method.as_str() {
        // ── use ──────────────────────────────────────────────────────────────
        "use" => {
            let ns = req
                .params
                .first()
                .and_then(|v| v.as_str())
                .unwrap_or("default");
            let db_name = req
                .params
                .get(1)
                .and_then(|v| v.as_str())
                .unwrap_or("default");

            match db.use_ns(ns).use_db(db_name).await {
                Ok(_) => RpcResponse::ok(id, serde_json::Value::Null),
                Err(e) => RpcResponse::err(id, -32000, e.to_string()),
            }
        }

        // ── query ─────────────────────────────────────────────────────────────
        "query" => {
            let sql = match req.params.first().and_then(|v| v.as_str()) {
                Some(s) => s.to_owned(),
                None => {
                    return RpcResponse::err(id, -32602, "query: missing SQL parameter");
                }
            };

            let mut q = db.query(&sql);

            // Bind named variables from the optional second parameter object.
            // We collect owned (String, Value) pairs first because bind()
            // requires `'static` bindings.
            let bindings: Vec<(String, serde_json::Value)> = req
                .params
                .get(1)
                .and_then(|v| v.as_object())
                .map(|obj| {
                    obj.iter()
                        .map(|(k, v)| (k.clone(), v.clone()))
                        .collect()
                })
                .unwrap_or_default();

            for (key, val) in bindings {
                q = q.bind((key, val));
            }

            match q.await {
                Ok(mut response) => {
                    // Collect results from every statement in the query.
                    // SurrealValue is the only single-value type supported by
                    // `Response::take` with a usize index; we convert to JSON.
                    let mut results: Vec<serde_json::Value> = Vec::new();
                    let mut idx: usize = 0;
                    loop {
                        match response.take::<SurrealValue>(idx) {
                            Ok(val) => {
                                let json_val = serde_json::to_value(val)
                                    .unwrap_or(serde_json::Value::Null);
                                results.push(json_val);
                                idx += 1;
                            }
                            Err(_) => break,
                        }
                    }
                    RpcResponse::ok(id, serde_json::json!(results))
                }
                Err(e) => RpcResponse::err(id, -32000, e.to_string()),
            }
        }

        // ── select ────────────────────────────────────────────────────────────
        "select" => {
            let thing = match req.params.first().and_then(|v| v.as_str()) {
                Some(s) => s.to_owned(),
                None => {
                    return RpcResponse::err(id, -32602, "select: missing resource parameter");
                }
            };

            let sql = format!("SELECT * FROM {thing}");
            match db.query(sql).await {
                Ok(mut response) => {
                    let rows: Vec<serde_json::Value> =
                        response.take(0).unwrap_or_default();
                    RpcResponse::ok(id, serde_json::Value::Array(rows))
                }
                Err(e) => RpcResponse::err(id, -32000, e.to_string()),
            }
        }

        // ── create ────────────────────────────────────────────────────────────
        "create" => {
            let thing = match req.params.first().and_then(|v| v.as_str()) {
                Some(s) => s.to_owned(),
                None => {
                    return RpcResponse::err(id, -32602, "create: missing resource parameter");
                }
            };
            let data = req
                .params
                .get(1)
                .cloned()
                .unwrap_or(serde_json::Value::Object(Default::default()));

            let content = match serde_json::to_string(&data) {
                Ok(s) => s,
                Err(e) => return RpcResponse::err(id, -32602, e.to_string()),
            };
            let sql = format!("CREATE {thing} CONTENT {content}");

            match db.query(sql).await {
                Ok(mut response) => {
                    let rows: Vec<serde_json::Value> =
                        response.take(0).unwrap_or_default();
                    RpcResponse::ok(id, serde_json::Value::Array(rows))
                }
                Err(e) => RpcResponse::err(id, -32000, e.to_string()),
            }
        }

        // ── update ────────────────────────────────────────────────────────────
        "update" => {
            let thing = match req.params.first().and_then(|v| v.as_str()) {
                Some(s) => s.to_owned(),
                None => {
                    return RpcResponse::err(id, -32602, "update: missing resource parameter");
                }
            };
            let data = req
                .params
                .get(1)
                .cloned()
                .unwrap_or(serde_json::Value::Object(Default::default()));

            let content = match serde_json::to_string(&data) {
                Ok(s) => s,
                Err(e) => return RpcResponse::err(id, -32602, e.to_string()),
            };
            let sql = format!("UPDATE {thing} CONTENT {content}");

            match db.query(sql).await {
                Ok(mut response) => {
                    let rows: Vec<serde_json::Value> =
                        response.take(0).unwrap_or_default();
                    RpcResponse::ok(id, serde_json::Value::Array(rows))
                }
                Err(e) => RpcResponse::err(id, -32000, e.to_string()),
            }
        }

        // ── merge ─────────────────────────────────────────────────────────────
        "merge" => {
            let thing = match req.params.first().and_then(|v| v.as_str()) {
                Some(s) => s.to_owned(),
                None => {
                    return RpcResponse::err(id, -32602, "merge: missing resource parameter");
                }
            };
            let data = req
                .params
                .get(1)
                .cloned()
                .unwrap_or(serde_json::Value::Object(Default::default()));

            let content = match serde_json::to_string(&data) {
                Ok(s) => s,
                Err(e) => return RpcResponse::err(id, -32602, e.to_string()),
            };
            let sql = format!("UPDATE {thing} MERGE {content}");

            match db.query(sql).await {
                Ok(mut response) => {
                    let rows: Vec<serde_json::Value> =
                        response.take(0).unwrap_or_default();
                    RpcResponse::ok(id, serde_json::Value::Array(rows))
                }
                Err(e) => RpcResponse::err(id, -32000, e.to_string()),
            }
        }

        // ── delete ────────────────────────────────────────────────────────────
        "delete" => {
            let thing = match req.params.first().and_then(|v| v.as_str()) {
                Some(s) => s.to_owned(),
                None => {
                    return RpcResponse::err(id, -32602, "delete: missing resource parameter");
                }
            };

            let sql = format!("DELETE {thing}");
            match db.query(sql).await {
                Ok(mut response) => {
                    // DELETE returns None; convert it gracefully to a JSON null
                    let result = response
                        .take::<SurrealValue>(0)
                        .ok()
                        .and_then(|v| serde_json::to_value(v).ok())
                        .unwrap_or(serde_json::Value::Null);
                    RpcResponse::ok(id, result)
                }
                Err(e) => RpcResponse::err(id, -32000, e.to_string()),
            }
        }

        // ── unknown ───────────────────────────────────────────────────────────
        unknown => RpcResponse::err(
            id,
            -32601,
            format!("Method '{unknown}' not found"),
        ),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tauri command
// ─────────────────────────────────────────────────────────────────────────────

/// The single entry point exposed to the JS frontend.
///
/// `request` is a JSON string with the shape:
/// ```json
/// { "id": "1", "method": "query", "params": ["SELECT * FROM todo"] }
/// ```
///
/// Returns a JSON string:
/// ```json
/// { "id": "1", "result": [...] }
/// // or on error:
/// { "id": "1", "error": { "code": -32000, "message": "..." } }
/// ```
#[tauri::command]
async fn rpc(request: String, state: State<'_, AppState>) -> Result<String, String> {
    // Parse the incoming JSON-RPC request
    let req: RpcRequest = match serde_json::from_str(&request) {
        Ok(r) => r,
        Err(e) => {
            let resp = RpcResponse::err(serde_json::Value::Null, -32700, format!("Parse error: {e}"));
            return serde_json::to_string(&resp).map_err(|e| e.to_string());
        }
    };

    let response = dispatch(&state.db, req).await;
    serde_json::to_string(&response).map_err(|e| e.to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// App setup and entry point
// ─────────────────────────────────────────────────────────────────────────────

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Resolve a platform-appropriate data directory for the DB files.
            // On desktop this is typically ~/.local/share/<bundle-id>/
            // On iOS/Android Tauri maps this to app internal storage.
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Could not resolve app data directory");

            std::fs::create_dir_all(&app_data_dir)
                .expect("Could not create app data directory");

            let db_path = app_data_dir.join("surreal.db");
            let db_path_str = db_path
                .to_str()
                .expect("DB path contains non-UTF-8 characters")
                .to_owned();

            // Initialise the embedded SurrealDB instance synchronously so the
            // window's JS can call `rpc()` as soon as the page loads.
            let db = tauri::async_runtime::block_on(async move {
                let db = Surreal::new::<SurrealKv>(db_path_str)
                    .await
                    .expect("Failed to open SurrealKV database");

                // Pre-select the default namespace and database so the JS
                // client works out of the box without calling `use()` first.
                db.use_ns("default")
                    .use_db("todos")
                    .await
                    .expect("Failed to select namespace/database");

                db
            });

            app.manage(AppState { db });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![rpc])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
