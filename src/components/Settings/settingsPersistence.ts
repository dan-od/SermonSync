import { DEFAULT_SETTINGS_PANEL_STATE, type SettingsPanelState } from "./types";

export const SETTINGS_STORAGE_KEY = "sermonsync-settings-panel";

export function normalizeSettingsPanelState(value: unknown, base = DEFAULT_SETTINGS_PANEL_STATE): SettingsPanelState {
  const saved = value && typeof value === "object" ? value as Partial<SettingsPanelState> : {};
  const savedTransitions = saved.transitions ?? {} as Partial<SettingsPanelState["transitions"]>;
  return {
    ...base,
    ...saved,
    logo: { ...base.logo, ...(saved.logo ?? {}) },
    transitions: {
      scriptures: { ...base.transitions.scriptures, ...savedTransitions.scriptures },
      songs: { ...base.transitions.songs, ...savedTransitions.songs },
      layout: { ...base.transitions.layout, ...savedTransitions.layout },
      logo: { ...base.transitions.logo, ...savedTransitions.logo },
      black: { ...base.transitions.black, ...savedTransitions.black },
      clear: { ...base.transitions.clear, ...savedTransitions.clear },
    },
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
