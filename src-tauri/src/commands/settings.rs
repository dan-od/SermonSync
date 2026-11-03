use tauri::Manager;

const APP_SETTINGS_FILE: &str = "settings.json";
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
pub fn load_app_settings(app: tauri::AppHandle) -> Result<Option<String>, String> {
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
pub fn save_app_settings(app: tauri::AppHandle, payload: String) -> Result<(), String> {
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
