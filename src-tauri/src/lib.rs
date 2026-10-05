// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use display_info::DisplayInfo;
use serde::Serialize;
use serde_json::json;
use sha2::{Digest, Sha256};
#[cfg(debug_assertions)]
use std::io::{BufRead, BufReader};
#[cfg(debug_assertions)]
use std::process::{Child as SidecarChild, Stdio};
use tauri::{Emitter, Manager, WindowEvent};
mod media_import;
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::{
    process::{CommandChild as SidecarChild, CommandEvent},
    ShellExt,
};

/// Event name the frontend listens to for real-time sidecar stdout/stderr
/// lines, surfaced independent of the HTTP `/api/logs` poll so startup
/// failures (crash, missing deps, port conflicts) are visible immediately
/// instead of manifesting only as a generic `fetch()` failure.
const SIDECAR_LOG_EVENT: &str = "sidecar://log";
/// Emitted once if the child process exits (crashes) unexpectedly.
const SIDECAR_EXIT_EVENT: &str = "sidecar://exit";
/// Emitted once if the child process could not even be spawned.
const SIDECAR_SPAWN_ERROR_EVENT: &str = "sidecar://spawn-error";
const APP_SETTINGS_FILE: &str = "settings.json";

#[derive(Clone, Serialize)]
struct SidecarLogPayload {
    stream: &'static str, // "stdout" | "stderr"
    line: String,
}

#[derive(Clone, Serialize)]
struct SidecarExitPayload {
    code: Option<i32>,
}

#[derive(Clone, Serialize)]
struct SidecarSpawnErrorPayload {
    message: String,
}

const TEMPLATE_THEMES_FILE: &str = "templates/themes.json";
const KEYRING_SERVICE: &str = "sermonsync.ai-providers";
static MEDIA_THUMBNAIL_LOCK: Mutex<()> = Mutex::new(());
static FORWARD_SIDECAR_STARTUP_LOGS: AtomicBool = AtomicBool::new(true);

struct SidecarState(Mutex<Option<SidecarChild>>);

#[cfg(all(debug_assertions, target_os = "linux"))]
fn clear_stale_dev_sidecar(sidecar_dir: &std::path::Path) -> Result<(), String> {
    use nix::sys::signal::{kill, Signal};
    use nix::unistd::Pid;

    let port_available = || std::net::TcpListener::bind(("127.0.0.1", 8000)).is_ok();
    if port_available() { return Ok(()); }

    let expected_dir = std::fs::canonicalize(sidecar_dir)
        .map_err(|error| format!("failed to identify sidecar directory: {error}"))?;
    let output = std::process::Command::new("fuser")
        .arg("8000/tcp")
        .output()
        .map_err(|error| format!("port 8000 is occupied and its owner could not be identified: {error}"))?;
    let owners = String::from_utf8_lossy(&output.stdout);
    let mut stale_pids = Vec::new();
    for pid in owners.split_whitespace().filter_map(|value| value.parse::<i32>().ok()) {
        let cwd = std::fs::read_link(format!("/proc/{pid}/cwd")).ok();
        let command = std::fs::read(format!("/proc/{pid}/cmdline")).ok();
        let runs_main = command.as_deref().is_some_and(|bytes| {
            bytes.split(|byte| *byte == 0).any(|argument| argument == b"main.py")
        });
        if cwd.as_deref() == Some(expected_dir.as_path()) && runs_main {
            stale_pids.push(pid);
        }
    }
    if stale_pids.is_empty() {
        return Err("port 8000 is occupied by another service; SermonSync will not stop it".to_string());
    }
    for pid in &stale_pids {
        let _ = kill(Pid::from_raw(*pid), Signal::SIGTERM);
    }
    for _ in 0..20 {
        if port_available() { return Ok(()); }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    for pid in &stale_pids {
        let _ = kill(Pid::from_raw(*pid), Signal::SIGKILL);
    }
    for _ in 0..10 {
        if port_available() { return Ok(()); }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    Err("the stale SermonSync sidecar did not release port 8000".to_string())
}

#[cfg(all(debug_assertions, not(target_os = "linux")))]
fn clear_stale_dev_sidecar(_sidecar_dir: &std::path::Path) -> Result<(), String> {
    Ok(())
}

#[cfg(debug_assertions)]
fn stop_sidecar(state: &SidecarState) {
    if let Ok(mut child) = state.0.lock() {
        if let Some(child) = child.take() {
            // Child::kill() is unreliable here: on Ctrl+C the parent can exit
            // before the SIGKILL lands / the zombie is reaped, orphaning
            // uvicorn on port 8000. Send the SIGKILL directly by PID instead.
            #[cfg(unix)]
            {
                use nix::sys::signal::{Signal, kill};
                use nix::unistd::Pid;
                let _ = kill(Pid::from_raw(child.id() as i32), Signal::SIGKILL);
            }
            #[cfg(not(unix))]
            {
                let _ = child.kill();
            }
        }
    }
}

#[cfg(not(debug_assertions))]
fn stop_sidecar(state: &SidecarState) {
    if let Ok(mut child) = state.0.lock() {
        if let Some(child) = child.take() {
            let _ = child.kill();
        }
    }
}

/// WebKitGTK denies `getUserMedia`/`enumerateDevices` by default, so wired/USB
/// cameras (including v4l2loopback devices like the DroidCam/OBS virtual cam)
/// never show up in the frontend's camera picker unless the embedding app
/// explicitly enables media capture and auto-grants the permission request.
#[cfg(target_os = "linux")]
fn allow_camera_permission<R: tauri::Runtime>(webview: &tauri::Webview<R>) {
    use glib::object::Cast;
    use webkit2gtk::{PermissionRequestExt, SettingsExt, WebViewExt};

    let _ = webview.with_webview(|webview| {
        let webview = webview.inner();
        if let Some(settings) = WebViewExt::settings(&webview) {
            settings.set_enable_media_stream(true);
            settings.set_enable_mediasource(true);
        }
        webview.connect_permission_request(|_webview, request| {
            if let Some(media_request) = request.downcast_ref::<webkit2gtk::UserMediaPermissionRequest>() {
                media_request.allow();
                true
            } else {
                false
            }
        });
    });
}

fn keyring_entry(provider: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, provider)
        .map_err(|e| format!("failed to access secure credential storage: {e}"))
}

#[tauri::command]
fn load_provider_key(provider: String) -> Result<Option<String>, String> {
    let entry = keyring_entry(&provider)?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("failed to read secure provider key: {e}")),
    }
}

#[tauri::command]
fn save_provider_key(provider: String, api_key: String) -> Result<(), String> {
    let value = api_key.trim();
    let entry = keyring_entry(&provider)?;
    if value.is_empty() {
        entry
            .delete_credential()
            .map_err(|e| format!("failed to clear secure provider key: {e}"))?;
    } else {
        entry
            .set_password(value)
            .map_err(|e| format!("failed to save secure provider key: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeDisplayInfo {
    native_id: u32,
    name: String,
    friendly_name: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    logical_x: i32,
    logical_y: i32,
    logical_width: u32,
    logical_height: u32,
    scale_factor: f32,
    refresh_hz: Option<u32>,
    is_primary: bool,
}

/// Returns platform-native display metadata, including the active refresh rate.
/// Tauri's JavaScript monitor API intentionally omits refresh frequency.
#[tauri::command]
fn list_display_info() -> Result<Vec<NativeDisplayInfo>, String> {
    DisplayInfo::all()
        .map(|displays| {
            displays
                .into_iter()
                .map(|display| NativeDisplayInfo {
                    native_id: display.id,
                    name: display.name,
                    friendly_name: display.friendly_name,
                    // display-info reports logical bounds on Linux. Expose
                    // physical bounds for the selector while retaining the
                    // logical bounds used by GTK monitor matching.
                    x: if cfg!(target_os = "linux") {
                        (display.x as f32 * display.scale_factor.max(1.0)).round() as i32
                    } else {
                        display.x
                    },
                    y: if cfg!(target_os = "linux") {
                        (display.y as f32 * display.scale_factor.max(1.0)).round() as i32
                    } else {
                        display.y
                    },
                    width: if cfg!(target_os = "linux") {
                        (display.width as f32 * display.scale_factor.max(1.0)).round() as u32
                    } else {
                        display.width
                    },
                    height: if cfg!(target_os = "linux") {
                        (display.height as f32 * display.scale_factor.max(1.0)).round() as u32
                    } else {
                        display.height
                    },
                    logical_x: display.x,
                    logical_y: display.y,
                    logical_width: display.width,
                    logical_height: display.height,
                    scale_factor: display.scale_factor,
                    refresh_hz: (display.frequency > 0.0)
                        .then_some(display.frequency.round() as u32),
                    is_primary: display.is_primary,
                })
                .collect()
        })
        .map_err(|error| format!("failed to enumerate display modes: {error}"))
}

/// Place the projector window on the requested monitor.
///
/// On Linux/Wayland, a client cannot reliably place a top-level window with
/// x/y coordinates. GTK's monitor-targeted fullscreen request is the native
/// compositor-supported way to select the output. Other platforms retain the
/// normal Tauri position/size path in the frontend.
#[tauri::command]
fn place_projector_window(
    app: tauri::AppHandle,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale_factor: f64,
    native_x: Option<i32>,
    native_y: Option<i32>,
    native_width: Option<u32>,
    native_height: Option<u32>,
) -> Result<bool, String> {
    let window = app
        .get_webview_window("projector-output")
        .ok_or_else(|| "projector output window is not available".to_string())?;

    #[cfg(target_os = "linux")]
    {
        use gtk::prelude::*;

        let gtk_window = window
            .gtk_window()
            .map_err(|error| format!("failed to access projector GTK window: {error}"))?;
        let screen = gtk::prelude::GtkWindowExt::screen(&gtk_window)
            .ok_or_else(|| "projector GTK window has no display screen".to_string())?;
        let display = screen.display();

        let scale = scale_factor.max(1.0);
        let mut requested = vec![
            (x, y, width as i32, height as i32),
            (
                (x as f64 / scale).round() as i32,
                (y as f64 / scale).round() as i32,
                (width as f64 / scale).round() as i32,
                (height as f64 / scale).round() as i32,
            ),
        ];
        if let (Some(native_x), Some(native_y), Some(native_width), Some(native_height)) =
            (native_x, native_y, native_width, native_height)
        {
            requested.insert(0, (native_x, native_y, native_width as i32, native_height as i32));
        }

        let mut best_monitor = None;
        let mut best_score = i64::MAX;
        for monitor_index in 0..display.n_monitors() {
            let Some(monitor) = display.monitor(monitor_index) else {
                continue;
            };
            let geometry = monitor.geometry();
            let score = requested
                .iter()
                .map(|(target_x, target_y, target_width, target_height)| {
                    i64::from((geometry.x() - target_x).abs())
                        + i64::from((geometry.y() - target_y).abs())
                        + i64::from((geometry.width() - target_width).abs())
                        + i64::from((geometry.height() - target_height).abs())
                })
                .min()
                .unwrap_or(i64::MAX);
            if score < best_score {
                best_score = score;
                best_monitor = Some(monitor_index);
            }
        }

        if let Some(monitor_index) = best_monitor {
            // Map the window before requesting fullscreen. This prevents
            // XWayland/GTK from applying the request to the compositor's
            // current monitor when the window was created hidden.
            gtk::prelude::WidgetExt::show(&gtk_window);
            gtk_window.fullscreen_on_monitor(&screen, monitor_index);
            gtk_window.present();
            return Ok(true);
        }

        return Err("could not match projector output to a connected GTK monitor".to_string());
    }

    #[cfg(not(target_os = "linux"))]
    {
    window
        .set_position(tauri::PhysicalPosition::new(x, y))
        .map_err(|error| format!("failed to position projector output: {error}"))?;
    window
        .set_size(tauri::PhysicalSize::new(width, height))
        .map_err(|error| format!("failed to size projector output: {error}"))?;
    Ok(false)
    }
}

#[tauri::command]
fn load_template_themes(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let app_config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("failed to resolve app config directory: {e}"))?;
    let template_path = app_config_dir.join(TEMPLATE_THEMES_FILE);

    if !template_path.exists() {
        return Ok(None);
    }

    std::fs::read_to_string(&template_path)
        .map(Some)
        .map_err(|e| format!("failed to read template themes file: {e}"))
}

#[tauri::command]
fn save_template_themes(app: tauri::AppHandle, payload: String) -> Result<(), String> {
    let app_config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("failed to resolve app config directory: {e}"))?;
    let template_path = app_config_dir.join(TEMPLATE_THEMES_FILE);

    if let Some(parent) = template_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create template themes directory: {e}"))?;
    }

    std::fs::write(template_path, payload)
        .map_err(|e| format!("failed to write template themes file: {e}"))
}

#[tauri::command]
fn load_app_settings(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("failed to resolve app config directory: {e}"))?
        .join(APP_SETTINGS_FILE);
    if !path.exists() {
        return Ok(None);
    }
    std::fs::read_to_string(path)
        .map(Some)
        .map_err(|e| format!("failed to read app settings file: {e}"))
}

#[tauri::command]
fn save_app_settings(app: tauri::AppHandle, payload: String) -> Result<(), String> {
    let path = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("failed to resolve app config directory: {e}"))?
        .join(APP_SETTINGS_FILE);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create app settings directory: {e}"))?;
    }
    std::fs::write(path, payload)
        .map_err(|e| format!("failed to write app settings file: {e}"))
}

#[tauri::command]
fn save_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(path, contents).map_err(|e| format!("failed to write text file: {e}"))
}

/// Verify the Python AI sidecar is up by hitting its /health endpoint.
/// Returns the parsed JSON body (e.g. {"status": "ok"}) to the frontend,
/// or an error string the UI can surface in the SYS status display.
#[tauri::command]
async fn check_sidecar_health() -> Result<serde_json::Value, String> {
    let resp = reqwest::get("http://127.0.0.1:8000/health")
        .await
        .map_err(|e| format!("failed to reach sidecar: {e}"))?;
    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| format!("invalid response from sidecar: {e}"))
}

/// Normalize arbitrary video input to the H.264/AAC profile supported by the
/// WebKitGTK media backend. FFmpeg is intentionally invoked through PATH in
/// development; packaged builds should ship the same executable as a sidecar.
fn template_video_cache_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app.path().app_config_dir()
        .map_err(|error| format!("failed to resolve video cache directory: {error}"))?
        .join("video-cache");
    std::fs::create_dir_all(&directory)
        .map_err(|error| format!("failed to create video cache directory: {error}"))?;
    Ok(directory)
}

fn decode_template_video(data_url: &str) -> Result<Vec<u8>, String> {
    let comma = data_url.find(',').ok_or_else(|| "invalid video data URL".to_string())?;
    if !data_url.starts_with("data:") || !data_url[5..comma].to_ascii_lowercase().ends_with(";base64") {
        return Err("video data URL is not base64 encoded".to_string());
    }
    BASE64.decode(&data_url[comma + 1..])
        .map_err(|error| format!("invalid video data: {error}"))
}

fn template_video_hash(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf29ce484222325_u64, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
    })
}

#[tauri::command]
async fn read_template_image_file(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let file = std::path::Path::new(&path);
        let extension = file.extension().and_then(|value| value.to_str())
            .unwrap_or("").to_ascii_lowercase();
        let mime = match extension.as_str() {
            "jpg" | "jpeg" => "image/jpeg",
            "png" => "image/png",
            "webp" => "image/webp",
            "gif" => "image/gif",
            "bmp" => "image/bmp",
            "avif" => "image/avif",
            "svg" => "image/svg+xml",
            _ => return Err("Choose an image or video file.".to_string()),
        };
        let size = std::fs::metadata(file)
            .map_err(|error| format!("failed to inspect selected image: {error}"))?.len();
        if size > 32 * 1024 * 1024 {
            return Err("This image is too large for a template background (32 MB maximum).".to_string());
        }
        let bytes = std::fs::read(file)
            .map_err(|error| format!("failed to read selected image: {error}"))?;
        Ok(format!("data:{mime};base64,{}", BASE64.encode(bytes)))
    }).await.map_err(|error| format!("image import task failed: {error}"))?
}

#[tauri::command]
async fn import_overlay_png(app: tauri::AppHandle, path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let file = std::path::Path::new(&path);
        if !file.extension().and_then(|value| value.to_str()).is_some_and(|value| value.eq_ignore_ascii_case("png")) {
            return Err("Choose a .png image for the watermark.".to_string());
        }
        let size = std::fs::metadata(file)
            .map_err(|error| format!("failed to inspect watermark: {error}"))?.len();
        if size > 32 * 1024 * 1024 {
            return Err("Watermark PNG exceeds the 32 MB limit.".to_string());
        }
        let bytes = std::fs::read(file)
            .map_err(|error| format!("failed to read watermark: {error}"))?;
        if !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
            return Err("The selected file is not a valid PNG image.".to_string());
        }
        let directory = app.path().app_config_dir()
            .map_err(|error| format!("failed to locate overlay storage: {error}"))?
            .join("overlay-assets");
        std::fs::create_dir_all(&directory)
            .map_err(|error| format!("failed to create overlay storage: {error}"))?;
        let target = directory.join(format!("{:x}.png", Sha256::digest(&bytes)));
        if !target.exists() {
            std::fs::write(&target, bytes)
                .map_err(|error| format!("failed to save watermark: {error}"))?;
        }
        Ok(target.to_string_lossy().into_owned())
    }).await.map_err(|error| format!("watermark import task failed: {error}"))?
}

#[tauri::command]
async fn stage_template_video(app: tauri::AppHandle, data_url: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let input = decode_template_video(&data_url)?;
        let hash = template_video_hash(&input);
        let cache = template_video_cache_dir(&app)?;
        let prepared = cache.join(format!("{hash:016x}.mp4"));
        if prepared.is_file() { return Ok(prepared.to_string_lossy().into_owned()); }
        let staged = cache.join(format!("{hash:016x}-source.bin"));
        if std::fs::metadata(&staged).map(|metadata| metadata.len()).ok() != Some(input.len() as u64) {
            let nonce = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|error| format!("failed to create video staging name: {error}"))?
                .as_nanos();
            let temporary = cache.join(format!("{hash:016x}-{nonce}-staging.tmp"));
            std::fs::write(&temporary, input)
                .map_err(|error| format!("failed to stage template video: {error}"))?;
            std::fs::rename(&temporary, &staged)
                .map_err(|error| format!("failed to finalize staged video: {error}"))?;
        }
        Ok(staged.to_string_lossy().into_owned())
    }).await.map_err(|error| format!("video staging task failed: {error}"))?
}

#[tauri::command]
async fn create_media_thumbnail(app: tauri::AppHandle, path: String, category: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let extension = match category.as_str() {
            "audio" => "png",
            "images" | "videos" => "jpg",
            _ => return Err("unsupported media category".to_string()),
        };
        let source = PathBuf::from(&path);
        let metadata = std::fs::metadata(&source)
            .map_err(|error| format!("failed to read media file: {error}"))?;
        if !metadata.is_file() { return Err("media path is not a file".to_string()); }
        let modified = metadata.modified().ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_nanos())
            .unwrap_or_default();
        let identity = format!("{category}:{path}:{}:{modified}", metadata.len());
        let hash = template_video_hash(identity.as_bytes());
        let directory = app.path().app_config_dir()
            .map_err(|error| format!("failed to resolve thumbnail cache: {error}"))?
            .join("media-thumbnails");
        std::fs::create_dir_all(&directory)
            .map_err(|error| format!("failed to create thumbnail cache: {error}"))?;
        let output_path = directory.join(format!("{hash:016x}.{extension}"));
        let _guard = MEDIA_THUMBNAIL_LOCK.lock()
            .map_err(|_| "media thumbnail lock failed".to_string())?;
        if output_path.exists() { return Ok(output_path.to_string_lossy().into_owned()); }
        let temporary_path = directory.join(format!("{hash:016x}.tmp.{extension}"));
        let mut command = std::process::Command::new(media_import::engine_path(&app, "ffmpeg")?);
        command.args(["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-threads", "2"]);
        if category == "videos" { command.args(["-ss", "0.5"]); }
        command.arg("-i").arg(&source);
        if category == "audio" {
            command.args(["-filter_complex", "[0:a:0]aformat=channel_layouts=mono,showwavespic=s=640x360:colors=0x7b2ff7[wave]", "-map", "[wave]"]);
        } else {
            command.args(["-vf", "scale=640:360:force_original_aspect_ratio=increase,crop=640:360"]);
        }
        command.args(["-frames:v", "1", "-update", "1"]);
        if category != "audio" { command.args(["-q:v", "3"]); }
        let result = command.arg(&temporary_path).output();
        match result {
            Ok(output) if output.status.success() && temporary_path.exists() => {
                std::fs::rename(&temporary_path, &output_path)
                    .map_err(|error| format!("failed to cache thumbnail: {error}"))?;
                Ok(output_path.to_string_lossy().into_owned())
            }
            Ok(output) => {
                let _ = std::fs::remove_file(&temporary_path);
                let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
                Err(if detail.is_empty() { "could not create media thumbnail".to_string() } else { detail })
            }
            Err(error) => Err(format!("could not run FFmpeg for media thumbnail: {error}")),
        }
    }).await.map_err(|error| format!("thumbnail task failed: {error}"))?
}

#[tauri::command]
async fn import_bible_file(path: String) -> Result<serde_json::Value, String> {
    let path = PathBuf::from(path);
    let filename = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "invalid bible file path".to_string())?
        .to_string();

    if path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| !ext.eq_ignore_ascii_case("xml"))
        .unwrap_or(true)
    {
        return Err("only .xml Bible files can be imported".to_string());
    }

    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("failed to read bible file: {e}"))?;

    let client = reqwest::Client::new();
    let response = client
        .post("http://127.0.0.1:8000/api/bible/import")
        .json(&json!({ "filename": filename, "content": content }))
        .send()
        .await
        .map_err(|e| {
            if e.is_connect() {
                "Python sidecar is not running. \
                 Start it with: cd python-sidecar && python main.py"
                    .to_string()
            } else {
                format!("failed to reach sidecar: {e}")
            }
        })?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("failed to read sidecar response: {e}"))?;

    if !status.is_success() {
        // Extract the FastAPI `detail` field so the UI shows the real reason.
        let message = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|v| v.get("detail").and_then(|d| d.as_str()).map(str::to_owned))
            .unwrap_or(body);
        return Err(message);
    }

    serde_json::from_str(&body).map_err(|e| format!("invalid response from sidecar: {e}"))
}

/// Background health probe — poll /health until the sidecar is responsive
/// or we time out (60 × 500 ms = 30 s). This runs alongside the raw
/// stdout/stderr forwarding above; the two are complementary: this confirms
/// the HTTP server actually bound its port, while the log forwarding shows
/// *why* it didn't if it never does.
fn spawn_health_probe(app_handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        for attempt in 1u8..=60 {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            if let Ok(resp) = reqwest::get("http://127.0.0.1:8000/health").await {
                if resp.status().is_success() {
                    println!("[sidecar] health ok (attempt {attempt})");
                    // The HTTP log endpoint is authoritative after startup.
                    // Stop broadcasting every process line to webview event
                    // callbacks, which may belong to a pre-reload context.
                    FORWARD_SIDECAR_STARTUP_LOGS.store(false, Ordering::Relaxed);
                    return;
                }
            }
        }
        eprintln!(
            "[sidecar] did not respond within 30 s — \
             if running in dev mode, start it manually: \
             cd python-sidecar && python main.py"
        );
        let _ = app_handle.emit(
            SIDECAR_SPAWN_ERROR_EVENT,
            SidecarSpawnErrorPayload {
                message: "Sidecar did not respond within 30s".to_string(),
            },
        );
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SidecarState(Mutex::new(None)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        // The projector-output window is created lazily from the frontend
        // (WebviewWindow, not declared in tauri.conf.json), so granting camera
        // permission has to happen on page load rather than in `setup`.
        .on_page_load(|webview, _payload| {
            #[cfg(target_os = "linux")]
            allow_camera_permission(webview);
        })
        .setup(|app| {
            if let Err(error) = media_import::clean_interrupted_jobs(app.handle()) {
                eprintln!("[media-import] could not clean interrupted jobs: {error}");
            }
            let video_cache_dir = app.path().app_config_dir()?.join("video-cache");
            let video_cache_dir = video_cache_dir.to_string_lossy().into_owned();
            let managed_video_dir = app.path().app_data_dir()?.join("media").join("videos").join("assets");
            let managed_video_dir = managed_video_dir.to_string_lossy().into_owned();
            let window_handle = app.handle().clone();
            if let Some(window) = app.get_webview_window("main") {
                window.on_window_event(move |event| {
                    if matches!(event, WindowEvent::CloseRequested { .. }) {
                        if let Some(projector) = window_handle.get_webview_window("projector-output") {
                            let _ = projector.close();
                        }
                        window_handle.exit(0);
                    }
                });
            }

            #[cfg(debug_assertions)]
            let sidecar_result = {
                let sidecar_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../python-sidecar");
                let venv_python = sidecar_dir.parent().unwrap_or(&sidecar_dir).join(".venv/bin/python");
                let python = if venv_python.exists() { venv_python } else { PathBuf::from("python3") };
                clear_stale_dev_sidecar(&sidecar_dir).and_then(|()| {
                    std::process::Command::new(python)
                        .arg("main.py")
                        .env("SERMONSYNC_VIDEO_CACHE_DIR", &video_cache_dir)
                        .env("SERMONSYNC_MANAGED_VIDEO_DIR", &managed_video_dir)
                        .current_dir(sidecar_dir)
                        .stdout(Stdio::piped())
                        .stderr(Stdio::piped())
                        .spawn()
                        .map_err(|error| error.to_string())
                })
            };

            #[cfg(not(debug_assertions))]
            let sidecar_result = app
                .shell()
                .sidecar("python-sidecar")
                .map(|command| command.env("SERMONSYNC_VIDEO_CACHE_DIR", &video_cache_dir)
                    .env("SERMONSYNC_MANAGED_VIDEO_DIR", &managed_video_dir))
                .and_then(|command| command.spawn())
                .map_err(|error| error.to_string());

            // Development runs use the current Python source so audio fixes
            // are exercised immediately; release builds use the bundled sidecar.
            match sidecar_result {
                #[cfg(debug_assertions)]
                Ok(mut child) => {
                    let app_handle = app.handle().clone();
                    // Forward stdout/stderr line-by-line to the frontend as they
                    // arrive, so a crash/traceback/missing-dependency error is
                    // visible immediately instead of just a generic fetch failure.
                    if let Some(stdout) = child.stdout.take() {
                        let handle = app_handle.clone();
                        std::thread::spawn(move || {
                            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                                println!("[sidecar:stdout] {line}");
                                if FORWARD_SIDECAR_STARTUP_LOGS.load(Ordering::Relaxed) {
                                    let _ = handle.emit(
                                        SIDECAR_LOG_EVENT,
                                        SidecarLogPayload { stream: "stdout", line },
                                    );
                                }
                            }
                        });
                    }
                    if let Some(stderr) = child.stderr.take() {
                        let handle = app_handle.clone();
                        std::thread::spawn(move || {
                            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                                eprintln!("[sidecar:stderr] {line}");
                                if FORWARD_SIDECAR_STARTUP_LOGS.load(Ordering::Relaxed) {
                                    let _ = handle.emit(
                                        SIDECAR_LOG_EVENT,
                                        SidecarLogPayload { stream: "stderr", line },
                                    );
                                }
                            }
                        });
                    }

                    if let Ok(mut sidecar) = app.state::<SidecarState>().0.lock() {
                        *sidecar = Some(child);
                    }
                    println!("[sidecar] launched python-sidecar");

                    // Poll for the child's exit (crash) without holding the lock
                    // for the process's whole lifetime, so `stop_sidecar` can
                    // still take it on app exit.
                    let exit_handle = app_handle.clone();
                    let state_handle = app.handle().clone();
                    tauri::async_runtime::spawn(async move {
                        loop {
                            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                            let state = state_handle.state::<SidecarState>();
                            let status = {
                                let mut guard = match state.0.lock() {
                                    Ok(guard) => guard,
                                    Err(_) => break,
                                };
                                match guard.as_mut() {
                                    Some(child) => {
                                        let result = child.try_wait().ok().flatten();
                                        if result.is_some() { guard.take(); }
                                        result
                                    }
                                    None => break, // already stopped/taken elsewhere
                                }
                            };
                            if let Some(status) = status {
                                eprintln!("[sidecar] process exited unexpectedly: {status}");
                                let _ = exit_handle.emit(
                                    SIDECAR_EXIT_EVENT,
                                    SidecarExitPayload { code: status.code() },
                                );
                                break;
                            }
                        }
                    });

                    spawn_health_probe(app.handle().clone());
                }
                #[cfg(not(debug_assertions))]
                Ok((mut rx, child)) => {
                    let app_handle = app.handle().clone();
                    tauri::async_runtime::spawn(async move {
                        while let Some(event) = rx.recv().await {
                            match event {
                                CommandEvent::Stdout(bytes) => {
                                    let line = String::from_utf8_lossy(&bytes).trim_end().to_string();
                                    println!("[sidecar:stdout] {line}");
                                    if FORWARD_SIDECAR_STARTUP_LOGS.load(Ordering::Relaxed) {
                                        let _ = app_handle.emit(
                                            SIDECAR_LOG_EVENT,
                                            SidecarLogPayload { stream: "stdout", line },
                                        );
                                    }
                                }
                                CommandEvent::Stderr(bytes) => {
                                    let line = String::from_utf8_lossy(&bytes).trim_end().to_string();
                                    eprintln!("[sidecar:stderr] {line}");
                                    if FORWARD_SIDECAR_STARTUP_LOGS.load(Ordering::Relaxed) {
                                        let _ = app_handle.emit(
                                            SIDECAR_LOG_EVENT,
                                            SidecarLogPayload { stream: "stderr", line },
                                        );
                                    }
                                }
                                CommandEvent::Error(message) => {
                                    eprintln!("[sidecar] error: {message}");
                                    let _ = app_handle.emit(
                                        SIDECAR_SPAWN_ERROR_EVENT,
                                        SidecarSpawnErrorPayload { message },
                                    );
                                }
                                CommandEvent::Terminated(payload) => {
                                    eprintln!("[sidecar] process exited unexpectedly: {payload:?}");
                                    let _ = app_handle.emit(
                                        SIDECAR_EXIT_EVENT,
                                        SidecarExitPayload { code: payload.code },
                                    );
                                    break;
                                }
                                _ => {}
                            }
                        }
                    });

                    if let Ok(mut sidecar) = app.state::<SidecarState>().0.lock() {
                        *sidecar = Some(child);
                    }
                    println!("[sidecar] launched python-sidecar");
                    spawn_health_probe(app.handle().clone());
                }
                Err(e) => {
                    eprintln!("[sidecar] could not start: {e}");
                    let _ = app.handle().emit(
                        SIDECAR_SPAWN_ERROR_EVENT,
                        SidecarSpawnErrorPayload { message: e },
                    );
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            list_display_info,
            place_projector_window,
            check_sidecar_health,
            stage_template_video,
            read_template_image_file,
            import_overlay_png,
            create_media_thumbnail,
            media_import::import_video_asset,
            media_import::get_ready_video_asset,
            media_import::cancel_video_import,
            load_provider_key,
            save_provider_key,
            import_bible_file,
            load_template_themes,
            save_template_themes,
            load_app_settings,
            save_app_settings,
            save_text_file
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
