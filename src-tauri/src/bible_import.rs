//! Bible file import: reads a local XML Bible and forwards it to the sidecar.

use std::path::PathBuf;

use serde_json::json;

#[tauri::command]
pub async fn import_bible_file(path: String) -> Result<serde_json::Value, String> {
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
