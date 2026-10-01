// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::path::PathBuf;
use std::sync::Mutex;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::Serialize;
use serde_json::json;
#[cfg(debug_assertions)]
use std::io::{BufRead, BufReader};
#[cfg(debug_assertions)]
use std::process::{Child as SidecarChild, Stdio};
use tauri::{Emitter, Manager, WindowEvent};

mod projector;
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

struct SidecarState(Mutex<Option<SidecarChild>>);

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
#[tauri::command]
async fn normalize_video_data_url(data_url: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let comma = data_url
            .find(',')
            .ok_or_else(|| "invalid video data URL".to_string())?;
        let header = &data_url[5..comma];
        if !header.to_ascii_lowercase().ends_with(";base64") {
            return Err("video data URL is not base64 encoded".to_string());
        }
        let input_bytes = BASE64
            .decode(&data_url[comma + 1..])
            .map_err(|error| format!("invalid video data: {error}"))?;
        let temp_dir = std::env::temp_dir().join(format!("sermonsync-video-{}", std::process::id()));
        std::fs::create_dir_all(&temp_dir)
            .map_err(|error| format!("failed to create video temp directory: {error}"))?;
        let input_path = temp_dir.join("input.bin");
        let output_path = temp_dir.join("normalized.mp4");
        std::fs::write(&input_path, input_bytes)
            .map_err(|error| format!("failed to write video temp file: {error}"))?;

        let result = std::process::Command::new("ffmpeg")
            .args([
                "-hide_banner", "-loglevel", "error", "-y", "-i",
                input_path.to_string_lossy().as_ref(), "-c:v", "libx264", "-profile:v", "high",
                "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
                output_path.to_string_lossy().as_ref(),
            ])
            .output();

        let normalized = match result {
            Ok(output) if output.status.success() => std::fs::read(&output_path)
                .map_err(|error| format!("failed to read normalized video: {error}"))?,
            Ok(output) => {
                let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
                return Err(if detail.is_empty() { "FFmpeg could not decode this video".to_string() } else { detail });
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Err("FFmpeg is not installed or bundled with SermonSync".to_string());
            }
            Err(error) => return Err(format!("failed to run FFmpeg: {error}")),
        };
        let _ = std::fs::remove_dir_all(&temp_dir);
        Ok(format!("data:video/mp4;base64,{}", BASE64.encode(normalized)))
    })
    .await
    .map_err(|error| format!("video normalization task failed: {error}"))?
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
        .setup(|app| {
            let window_handle = app.handle().clone();
            if let Some(window) = app.get_webview_window("main") {
                window.on_window_event(move |event| {
                    if matches!(event, WindowEvent::CloseRequested { .. }) {
                        window_handle.exit(0);
                    }
                });
            }

            #[cfg(debug_assertions)]
            let sidecar_result = {
                let sidecar_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../python-sidecar");
                let venv_python = sidecar_dir.parent().unwrap_or(&sidecar_dir).join(".venv/bin/python");
                let python = if venv_python.exists() { venv_python } else { PathBuf::from("python3") };
                std::process::Command::new(python)
                    .arg("main.py")
                    .current_dir(sidecar_dir)
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .spawn()
                    .map_err(|error| error.to_string())
            };

            #[cfg(not(debug_assertions))]
            let sidecar_result = app
                .shell()
                .sidecar("python-sidecar")
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
                                let _ = handle.emit(
                                    SIDECAR_LOG_EVENT,
                                    SidecarLogPayload { stream: "stdout", line },
                                );
                            }
                        });
                    }
                    if let Some(stderr) = child.stderr.take() {
                        let handle = app_handle.clone();
                        std::thread::spawn(move || {
                            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                                eprintln!("[sidecar:stderr] {line}");
                                let _ = handle.emit(
                                    SIDECAR_LOG_EVENT,
                                    SidecarLogPayload { stream: "stderr", line },
                                );
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
                                    Some(child) => child.try_wait().ok().flatten(),
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
                                    let _ = app_handle.emit(
                                        SIDECAR_LOG_EVENT,
                                        SidecarLogPayload { stream: "stdout", line },
                                    );
                                }
                                CommandEvent::Stderr(bytes) => {
                                    let line = String::from_utf8_lossy(&bytes).trim_end().to_string();
                                    eprintln!("[sidecar:stderr] {line}");
                                    let _ = app_handle.emit(
                                        SIDECAR_LOG_EVENT,
                                        SidecarLogPayload { stream: "stderr", line },
                                    );
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
                    eprintln!(
                        "[sidecar] not bundled yet: {e}; run `cd python-sidecar && python main.py` in dev"
                    );
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
            check_sidecar_health,
            normalize_video_data_url,
            load_provider_key,
            save_provider_key,
            import_bible_file,
            load_template_themes,
            save_template_themes,
            save_text_file,
            projector::list_displays,
            projector::open_projector_window,
            projector::close_projector_window
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {
                stop_sidecar(&app.state::<SidecarState>());
            }
        });
}
