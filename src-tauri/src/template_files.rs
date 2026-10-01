//! Template theme persistence (app config dir) and plain text file export.

use tauri::Manager;

const TEMPLATE_THEMES_FILE: &str = "templates/themes.json";

#[tauri::command]
pub fn load_template_themes(app: tauri::AppHandle) -> Result<Option<String>, String> {
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
pub fn save_template_themes(app: tauri::AppHandle, payload: String) -> Result<(), String> {
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
pub fn save_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(path, contents).map_err(|e| format!("failed to write text file: {e}"))
}
