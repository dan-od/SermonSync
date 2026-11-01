import { invoke } from "@tauri-apps/api/core";
import { postProjectorChannelMessage } from "./projectorChannel";
import type { TemplateThemeDocument } from "../types/templates";
import { parseDocument, sanitizeDocument } from "./templateSanitizers";

export { createEmptyTemplate } from "./templateDefaults";

const LOCAL_STORAGE_KEY = "sermonsync-template-themes-v1";
export const TEMPLATE_THEMES_CHANGED_EVENT = "templates://changed";

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function loadTemplateThemes(): Promise<TemplateThemeDocument> {
  if (isTauriRuntime()) {
    try {
      const json = await invoke<string | null>("load_template_themes");
      return parseDocument(json);
    } catch {
      const local = typeof window !== "undefined" ? window.localStorage.getItem(LOCAL_STORAGE_KEY) : null;
      return parseDocument(local);
    }
  }

  const local = typeof window !== "undefined" ? window.localStorage.getItem(LOCAL_STORAGE_KEY) : null;
  return parseDocument(local);
}

export async function saveTemplateThemes(document: TemplateThemeDocument): Promise<void> {
  const sanitized = sanitizeDocument(document);
  const payload = JSON.stringify(sanitized, null, 2);

  if (isTauriRuntime()) {
    // The projector window reloads from this file after the event below. A
    // failed native write must surface as a failed save, not appear successful
    // while the projector keeps reading an older template.
    await invoke("save_template_themes", { payload });
    postProjectorChannelMessage({ type: "templates-changed" });
  }

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, payload);
    } catch (error) {
      // Tauri storage is authoritative. A large media data URL must not crash the UI
      // when the browser backup reaches its quota.
      console.warn("Template backup could not be written to local storage", error);
    }
  }
}
