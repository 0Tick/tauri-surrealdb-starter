#![recursion_limit = "256"]

mod commands;
mod error;
mod state;

use tauri::Manager;

pub use commands::{
    surreal_bridge_bucket_folder_allowlist, surreal_bridge_connect, surreal_bridge_disconnect,
    surreal_bridge_health, surreal_bridge_send,
};
pub use error::BridgeError;
pub use state::BridgeChannelMessage;

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("surreal_tauri_bridge")
        .setup(|app, _| {
            app.manage(state::BridgeState::new()?);
            Ok(())
        })
        .build()
}

#[macro_export]
macro_rules! invoke_handler {
    () => {
        tauri::generate_handler![
            $crate::surreal_bridge_connect,
            $crate::surreal_bridge_send,
            $crate::surreal_bridge_disconnect,
            $crate::surreal_bridge_bucket_folder_allowlist,
            $crate::surreal_bridge_health
        ]
    };
}