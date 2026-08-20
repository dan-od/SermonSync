/**
 * System configuration store (SS-004 scaffold).
 *
 * Non-secret fields persist to localStorage via zustand's `persist` middleware
 * (see `partialize` below). API keys are saved through Tauri secure storage
 * instead and reloaded into memory at launch via `hydrateProviderKeys`.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";

import type { BibleVersionSummary, ModelProviderId, SystemConfig, UiTheme } from "../types/state";
import { getBrowserStorage } from "./persistStorage";

interface ConfigStore extends SystemConfig {
  setUnit: (unitId: string, unitName: string) => void;
  setBibleVersion: (version: string) => void;
  setBibleVersions: (versions: BibleVersionSummary[]) => void;
  setTheme: (theme: UiTheme) => void;
  toggleTheme: () => void;
  setGroq: (apiKey: string | null, enabled: boolean) => Promise<void>;
  setModelProviderKey: (provider: Exclude<ModelProviderId, "groq">, apiKey: string | null) => Promise<void>;
  loadProviderKey: (provider: ModelProviderId) => Promise<string | null>;
  setDefaultModelProvider: (provider: ModelProviderId | null) => void;
  hydrateProviderKeys: () => Promise<void>;
  reset: () => void;
}

const initialState: SystemConfig = {
  unitId: "FSQ-PH-MGBUOGBA-01",
  unitName: "Foursquare Gospel Church, Mgbuogba",
  bibleVersion: "",
  bibleVersions: [],
  theme: "dark",
  groqApiKey: null,
  groqEnabled: false,
  modelProviderKeys: {},
  defaultModelProvider: null,
};

export const useConfigStore = create<ConfigStore>()(
  persist(
    (set) => ({
      ...initialState,

      setUnit: (unitId, unitName) => set({ unitId, unitName }),

      setBibleVersion: (bibleVersion) => set({ bibleVersion }),

      setBibleVersions: (bibleVersions) => set({ bibleVersions }),

      setTheme: (theme) => set({ theme }),

      toggleTheme: () =>
        set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),

      setGroq: async (groqApiKey, groqEnabled) => {
        await invoke("save_provider_key", { provider: "groq", apiKey: groqApiKey ?? "" });
        set({ groqApiKey, groqEnabled });
      },

      setModelProviderKey: async (provider, apiKey) => {
        await invoke("save_provider_key", { provider, apiKey: apiKey ?? "" });
        set((s) => {
          const modelProviderKeys = { ...s.modelProviderKeys };
          if (apiKey && apiKey.trim().length > 0) {
            modelProviderKeys[provider] = apiKey;
          } else {
            delete modelProviderKeys[provider];
          }
          const defaultModelProvider = s.defaultModelProvider === provider && !modelProviderKeys[provider] ? null : s.defaultModelProvider;
          return { modelProviderKeys, defaultModelProvider };
        });
      },

      loadProviderKey: async (provider) => {
        try {
          return await invoke<string | null>("load_provider_key", { provider });
        } catch {
          return null;
        }
      },

      setDefaultModelProvider: (defaultModelProvider) => set({ defaultModelProvider }),

      // Rehydrates keys from Tauri secure storage into memory on launch — the keys
      // themselves never live in localStorage, only this in-memory copy does.
      hydrateProviderKeys: async () => {
        const providers: ModelProviderId[] = ["groq", "openai", "anthropic", "gemini"];
        const results = await Promise.all(
          providers.map(async (provider) => {
            try {
              return await invoke<string | null>("load_provider_key", { provider });
            } catch {
              return null;
            }
          }),
        );

        set((s) => {
          const [groq, openai, anthropic, gemini] = results;
          const modelProviderKeys = { ...s.modelProviderKeys };
          if (openai) modelProviderKeys.openai = openai;
          if (anthropic) modelProviderKeys.anthropic = anthropic;
          if (gemini) modelProviderKeys.gemini = gemini;
          return {
            groqApiKey: groq ?? s.groqApiKey,
            modelProviderKeys,
          };
        });
      },

      reset: () => set({ ...initialState }),
    }),
    {
      name: "sermonsync-config-store",
      storage: createJSONStorage(getBrowserStorage),
      partialize: (state) => ({
        unitId: state.unitId,
        unitName: state.unitName,
        bibleVersion: state.bibleVersion,
        bibleVersions: state.bibleVersions,
        theme: state.theme,
        groqEnabled: state.groqEnabled,
        defaultModelProvider: state.defaultModelProvider,
      }),
    },
  ),

);
