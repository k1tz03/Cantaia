// Cantaia Desktop — Tauri 2.0
// Full implementation in Step 9

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Cantaia");
}
