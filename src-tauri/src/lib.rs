#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(surreal_tauri_bridge::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(surreal_tauri_bridge::invoke_handler![])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
