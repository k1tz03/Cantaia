// Cantaia Desktop — Entry point
// Toute la logique est dans lib.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    cantaia_lib::run();
}
