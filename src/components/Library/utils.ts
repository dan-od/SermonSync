export function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

export function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}
