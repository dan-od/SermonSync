// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Launch the Python AI sidecar on app start. In production the
            // sidecar is a bundled binary (see src-tauri/binaries/). In dev,
            // if that binary isn't present yet, this logs a hint instead of
            // crashing — run `cd python-sidecar && python main.py` manually.
            match app.shell().sidecar("python-sidecar") {
                Ok(command) => match command.spawn() {
                    Ok(_) => println!("[sidecar] launched python-sidecar"),
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
        .invoke_handler(tauri::generate_handler![greet, check_sidecar_health])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
