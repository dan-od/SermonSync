// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::path::PathBuf;
use std::sync::Mutex;

use serde_json::json;
#[cfg(debug_assertions)]
use std::process::Child as SidecarChild;
use tauri::Manager;
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::{process::CommandChild as SidecarChild, ShellExt};

const TEMPLATE_THEMES_FILE: &str = "templates/themes.json";
const KEYRING_SERVICE: &str = "sermonsync.ai-providers";

struct SidecarState(Mutex<Option<SidecarChild>>);

#[cfg(debug_assertions)]
fn stop_sidecar(state: &SidecarState) {
    if let Ok(mut child) = state.0.lock() {
        if let Some(mut child) = child.take() {
            let _ = child.kill();
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SidecarState(Mutex::new(None)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(debug_assertions)]
            let sidecar_result = {
                let sidecar_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../python-sidecar");
                let venv_python = sidecar_dir.parent().unwrap_or(&sidecar_dir).join(".venv/bin/python");
                let python = if venv_python.exists() { venv_python } else { PathBuf::from("python3") };
                std::process::Command::new(python)
                    .arg("main.py")
                    .current_dir(sidecar_dir)
                    .spawn()
                    .map_err(|error| error.to_string())
            };

            #[cfg(not(debug_assertions))]
            let sidecar_result = app
                .shell()
                .sidecar("python-sidecar")
                .and_then(|command| command.spawn())
                .map(|(_rx, child)| child)
                .map_err(|error| error.to_string());

            // Development runs use the current Python source so audio fixes
            // are exercised immediately; release builds use the bundled sidecar.
            match sidecar_result {
                Ok(child) => {
                if let Ok(mut sidecar) = app.state::<SidecarState>().0.lock() {
                    *sidecar = Some(child);
                }
                println!("[sidecar] launched python-sidecar");
                // Background health probe — poll /health until the sidecar is
                // responsive or we time out (60 × 500 ms = 30 s).
                tauri::async_runtime::spawn(async {
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
                });
                }
                Err(e) => eprintln!(
                    "[sidecar] not bundled yet: {e}; run `cd python-sidecar && python main.py` in dev"
                ),
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            check_sidecar_health,
            load_provider_key,
            save_provider_key,
            import_bible_file,
            load_template_themes,
            save_template_themes
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {
                stop_sidecar(&app.state::<SidecarState>());
            }
        });
}
