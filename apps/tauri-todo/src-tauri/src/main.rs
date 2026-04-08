// src-tauri/src/main.rs
// Entry point for the desktop binary.  On mobile the `lib` crate-type is used
// instead so this file is ignored.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri_todo_lib::run();
}
