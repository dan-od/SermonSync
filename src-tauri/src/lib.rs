// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::sync::Mutex;

use tauri::{Manager, WindowEvent};

mod bible_import;
mod media;
mod projector;
mod provider_keys;
mod sidecar;
mod template_files;

use sidecar::SidecarState;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SidecarState(Mutex::new(None)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let window_handle = app.handle().clone();
            if let Some(window) = app.get_webview_window("main") {
                window.on_window_event(move |event| {
                    if matches!(event, WindowEvent::CloseRequested { .. }) {
                        window_handle.exit(0);
                    }
                });
            }

            sidecar::launch_sidecar(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            sidecar::check_sidecar_health,
            media::normalize_video_data_url,
            provider_keys::load_provider_key,
            provider_keys::save_provider_key,
            bible_import::import_bible_file,
            template_files::load_template_themes,
            template_files::save_template_themes,
            template_files::save_text_file,
            projector::list_displays,
            projector::open_projector_window,
            projector::close_projector_window
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {
                sidecar::stop_sidecar(&app.state::<SidecarState>());
            }
        });
}
