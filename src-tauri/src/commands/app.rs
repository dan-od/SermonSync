#[tauri::command]
pub fn close_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
pub fn save_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(path, contents).map_err(|e| format!("failed to write text file: {e}"))
}

/// Verify the Python AI sidecar is up by hitting its /health endpoint.
/// Returns the parsed JSON body (e.g. {"status": "ok"}) to the frontend,
/// or an error string the UI can surface in the SYS status display.
#[tauri::command]
pub async fn check_sidecar_health() -> Result<serde_json::Value, String> {
    let resp = reqwest::get("http://127.0.0.1:8000/health")
        .await
        .map_err(|e| format!("failed to reach sidecar: {e}"))?;
    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| format!("invalid response from sidecar: {e}"))
}
