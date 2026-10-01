//! AI provider API keys, stored in the OS secure credential store (keyring).

const KEYRING_SERVICE: &str = "sermonsync.ai-providers";

fn keyring_entry(provider: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, provider)
        .map_err(|e| format!("failed to access secure credential storage: {e}"))
}

#[tauri::command]
pub fn load_provider_key(provider: String) -> Result<Option<String>, String> {
    let entry = keyring_entry(&provider)?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("failed to read secure provider key: {e}")),
    }
}

#[tauri::command]
pub fn save_provider_key(provider: String, api_key: String) -> Result<(), String> {
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
