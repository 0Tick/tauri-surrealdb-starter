mod surreal_bridge;

use surreal_bridge::{
    db_authenticate, db_close, db_connect, db_create, db_delete, db_get_files_path, db_health,
    db_info, db_insert, db_invalidate, db_let, db_merge, db_patch, db_query, db_relate, db_run,
    db_select, db_signin, db_signup, db_unset, db_update, db_upsert, db_use, db_version,
    DatabaseState,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(DatabaseState::default())
        .setup(|_app| Ok(()))
        .invoke_handler(tauri::generate_handler![
            db_get_files_path,
            db_connect,
            db_health,
            db_version,
            db_use,
            db_signin,
            db_signup,
            db_authenticate,
            db_invalidate,
            db_let,
            db_unset,
            db_info,
            db_select,
            db_create,
            db_insert,
            db_update,
            db_upsert,
            db_merge,
            db_patch,
            db_delete,
            db_relate,
            db_run,
            db_query,
            db_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
