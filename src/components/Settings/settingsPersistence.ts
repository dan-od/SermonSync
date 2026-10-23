import { invoke } from "@tauri-apps/api/core";
import { useProjectorStore } from "../../stores/projectorStore";
import { normalizeTransitions } from "../../lib/transitions";
import { DEFAULT_SETTINGS_PANEL_STATE, type SettingsPanelState } from "./types";

export const SETTINGS_STORAGE_KEY = "sermonsync-settings-panel";

export function normalizeSettingsPanelState(value: unknown, base = DEFAULT_SETTINGS_PANEL_STATE): SettingsPanelState {
  const saved = value && typeof value === "object" ? value as Partial<SettingsPanelState> : {};
  return {
    ...base,
    ...saved,
    logo: { ...base.logo, ...(saved.logo ?? {}) },
    transitions: normalizeTransitions(saved.transitions),
  };
}

export function loadPanelState(): SettingsPanelState {
  if (typeof window === "undefined") return DEFAULT_SETTINGS_PANEL_STATE;
  try {
    const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    return stored ? normalizeSettingsPanelState(JSON.parse(stored)) : DEFAULT_SETTINGS_PANEL_STATE;
  } catch {
    return DEFAULT_SETTINGS_PANEL_STATE;
  }
}

// The settings panel is lazy-loaded, so logo and transitions must reach the
// projector store at startup rather than when Settings is first opened.
export function hydrateProjectorSettings(): () => void {
  let active = true;
  const apply = (state: SettingsPanelState) => {
    const store = useProjectorStore.getState();
    store.setTransitions(state.transitions);
    store.setLogo(state.logo);
  };
  apply(loadPanelState());
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    void invoke<string | null>("load_app_settings").then((payload) => {
      if (active && payload) apply(normalizeSettingsPanelState(JSON.parse(payload)));
    }).catch((error: unknown) => console.warn("Native settings could not be loaded", error));
  }
  return () => { active = false; };
}
