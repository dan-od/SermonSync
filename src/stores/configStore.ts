/**
 * System configuration store (SS-004 scaffold).
 *
 * Persisted app/unit configuration. TODO(Dee): back this with Tauri's store
 * plugin (or a config file) so settings survive restarts; move groqApiKey to
 * secure storage rather than plain state.
 */
import { create } from "zustand";

import type { SystemConfig, UiTheme } from "../types/state";

interface ConfigStore extends SystemConfig {
  setUnit: (unitId: string, unitName: string) => void;
  setBibleVersion: (version: string) => void;
  setTheme: (theme: UiTheme) => void;
  toggleTheme: () => void;
  setGroq: (apiKey: string | null, enabled: boolean) => void;
  reset: () => void;
}

const initialState: SystemConfig = {
  unitId: "FSQ-PH-MGBUOGBA-01",
  unitName: "Foursquare Gospel Church, Mgbuogba",
  bibleVersion: "KJV",
  theme: "dark",
  groqApiKey: null,
  groqEnabled: false,
};

export const useConfigStore = create<ConfigStore>((set) => ({
  ...initialState,

  setUnit: (unitId, unitName) => set({ unitId, unitName }),

  setBibleVersion: (bibleVersion) => set({ bibleVersion }),

  setTheme: (theme) => set({ theme }),

  toggleTheme: () =>
    set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),

  // TODO(Dee): persist to secure storage, validate the key against Groq.
  setGroq: (groqApiKey, groqEnabled) => set({ groqApiKey, groqEnabled }),

  reset: () => set({ ...initialState }),
}));
