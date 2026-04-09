mod surreal_bridge;

use tauri::Manager;
use surreal_bridge::{
    db_close, db_connect, db_health, db_query, db_signin, db_use, DatabaseState,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(DatabaseState::default())
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db_connect,
            db_health,
            db_use,
            db_signin,
            db_query,
            db_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
