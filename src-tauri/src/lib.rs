// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::path::PathBuf;

use serde_json::json;
use tauri_plugin_shell::ShellExt;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Launch the Python AI sidecar on app start. In production the
            // sidecar is a bundled binary (see src-tauri/binaries/). In dev,
            // if that binary isn't present yet, this logs a hint instead of
            // crashing — run `cd python-sidecar && python main.py` manually.
            match app.shell().sidecar("python-sidecar") {
                Ok(command) => match command.spawn() {
                    Ok(_) => {
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
                        "[sidecar] spawn failed: {e}; run the sidecar manually in dev"
                    ),
                },
                Err(e) => eprintln!(
                    "[sidecar] not bundled yet: {e}; run `cd python-sidecar && python main.py` in dev"
                ),
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            check_sidecar_health,
            import_bible_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
