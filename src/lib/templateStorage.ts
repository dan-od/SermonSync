import { invoke } from "@tauri-apps/api/core";

import type { TemplateThemeDocument } from "../types/templates";

import { makeEmptyDocument } from "./templateDefaults";
import { sanitizeDocument } from "./templateSanitizers";

export { createEmptyTemplate } from "./templateDefaults";

const LOCAL_STORAGE_KEY = "sermonsync-template-themes-v1";

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function parseDocument(input: string | null): TemplateThemeDocument {
  if (!input) {
    return makeEmptyDocument();
  }

  try {
    const parsed = JSON.parse(input) as TemplateThemeDocument;
    if (!parsed || !Array.isArray(parsed.templates) || !parsed.defaults) {
      return makeEmptyDocument();
    }
    return sanitizeDocument(parsed);
  } catch {
    return makeEmptyDocument();
  }
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
    try {
      await invoke("save_template_themes", { payload });
    } catch {
      // Fall through to local storage backup.
    }
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
