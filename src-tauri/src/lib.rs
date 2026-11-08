// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::sync::Mutex;

use tauri::{Emitter, Manager, WindowEvent};
mod audio_import;
mod commands;
mod media_import;
mod sidecar;
mod song_search;

use sidecar::{spawn_sidecar, stop_sidecar, SidecarState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SidecarState(Mutex::new(None)))
        .manage(song_search::SongSearchRegistry::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        // The projector-output window is created lazily from the frontend
        // (WebviewWindow, not declared in tauri.conf.json), so granting camera
        // permission has to happen on page load rather than in `setup`.
        .on_page_load(|webview, _payload| {
            #[cfg(target_os = "linux")]
            commands::camera::allow_camera_permission(webview);
        })
        .setup(|app| {
            if let Err(error) = media_import::clean_interrupted_jobs(app.handle()) {
                eprintln!("[media-import] could not clean interrupted jobs: {error}");
            }
            let video_cache_dir = app.path().app_config_dir()?.join("video-cache");
            let video_cache_dir = video_cache_dir.to_string_lossy().into_owned();
            let managed_video_dir = app.path().app_data_dir()?.join("media").join("videos").join("assets");
            let managed_video_dir = managed_video_dir.to_string_lossy().into_owned();
            let managed_audio_dir = app.path().app_data_dir()?.join("media").join("audio").join("assets");
            let managed_audio_dir = managed_audio_dir.to_string_lossy().into_owned();
            let window_handle = app.handle().clone();
            if let Some(window) = app.get_webview_window("main") {
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        if let Some(projector) = window_handle.get_webview_window("projector-output") {
                            let _ = projector.close();
                        }
                        let _ = window_handle.emit("app://close-requested", ());
                    }
                });
            }

            spawn_sidecar(app, &video_cache_dir, &managed_video_dir, &managed_audio_dir)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::greet,
            commands::display::list_display_info,
            commands::display::place_projector_window,
            commands::app::check_sidecar_health,
            commands::media::stage_template_video,
            commands::media::read_template_image_file,
            commands::media::import_overlay_png,
            commands::media::create_media_thumbnail,
            audio_import::import_audio_asset,
            audio_import::get_audio_waveform,
            media_import::import_video_asset,
            media_import::get_ready_video_asset,
            media_import::cancel_video_import,
            commands::keyring::load_provider_key,
            commands::keyring::save_provider_key,
            song_search::start_song_search,
            song_search::cancel_song_search,
            commands::bible::import_bible_file,
            commands::settings::load_template_themes,
            commands::settings::save_template_themes,
            commands::settings::load_app_settings,
            commands::settings::save_app_settings,
            commands::app::save_text_file,
            commands::app::close_app
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {
                if let Some(projector) = app.get_webview_window("projector-output") {
                    let _ = projector.close();
                }
                stop_sidecar(&app.state::<SidecarState>());
            }
        });
}
