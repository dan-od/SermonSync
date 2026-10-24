import appPresetPackJson from "./appPresetPack.json";

import { useOverlayStore } from "../stores/overlayStore";
import { useSongStore, type Song } from "../stores/songStore";
import { useTemplateStore } from "../stores/templateStore";
import type { OverlayDefinition } from "../types/overlays";
import type { OverlayMode } from "../types/state";
import type { TemplateCanvasTheme, TemplateCategory } from "../types/templates";

interface AppPresetPack {
  version: number;
  songs: Song[];
  overlays: OverlayDefinition[];
  templates: TemplateCanvasTheme[];
  templateDefaults: Record<TemplateCategory, Record<OverlayMode, string | null>>;
}

export type AppPresetSelection = {
  songs: boolean;
  overlays: boolean;
  templates: boolean;
};

export interface AppPresetInstallResult {
  songs: { added: number; alreadyPresent: number };
  overlays: { added: number; alreadyPresent: number };
  templates: { added: number; alreadyPresent: number };
}

export const appPresetCounts = {
  songs: appPresetPackJson.songs.length,
  overlays: appPresetPackJson.overlays.length,
  templates: appPresetPackJson.templates.length,
};

const appPresetPack = appPresetPackJson as unknown as AppPresetPack;

async function waitForTemplatesToInitialize(): Promise<void> {
  await useTemplateStore.getState().initialize();
  const current = useTemplateStore.getState();
  if (current.initialized && !current.loading) return;

  await new Promise<void>((resolve) => {
    const unsubscribe = useTemplateStore.subscribe((state) => {
      if (state.initialized && !state.loading) {
        unsubscribe();
        resolve();
      }
    });
    const latest = useTemplateStore.getState();
    if (latest.initialized && !latest.loading) {
      unsubscribe();
      resolve();
    }
  });
}

export async function installAppPresets(selection: AppPresetSelection): Promise<AppPresetInstallResult> {
  const result: AppPresetInstallResult = {
    songs: { added: 0, alreadyPresent: 0 },
    overlays: { added: 0, alreadyPresent: 0 },
    templates: { added: 0, alreadyPresent: 0 },
  };

  if (selection.songs) {
    useSongStore.getState().initialize();
    const existingIds = new Set(useSongStore.getState().songs.map((song) => song.id));
    for (const song of appPresetPack.songs) {
      if (existingIds.has(song.id)) {
        result.songs.alreadyPresent += 1;
        continue;
      }
      useSongStore.getState().saveSong(song);
      existingIds.add(song.id);
      result.songs.added += 1;
    }
  }

  if (selection.overlays) {
    const existingIds = new Set(useOverlayStore.getState().overlays.map((overlay) => overlay.id));
    for (const overlay of appPresetPack.overlays) {
      if (existingIds.has(overlay.id)) {
        result.overlays.alreadyPresent += 1;
        continue;
      }
      if (!useOverlayStore.getState().upsert(overlay)) {
        throw new Error(`Could not save overlay preset "${overlay.name}".`);
      }
      existingIds.add(overlay.id);
      result.overlays.added += 1;
    }
  }

  if (selection.templates) {
    await waitForTemplatesToInitialize();
    const existingIds = new Set(useTemplateStore.getState().templates.map((template) => template.id));
    for (const template of appPresetPack.templates) {
      if (existingIds.has(template.id)) {
        result.templates.alreadyPresent += 1;
        continue;
      }
      await useTemplateStore.getState().upsertTemplate(template);
      existingIds.add(template.id);
      result.templates.added += 1;
    }

    for (const category of ["scriptures", "songs"] as const) {
      for (const layout of ["widescreen", "lower-third", "split-screen"] as const) {
        const templateId = appPresetPack.templateDefaults[category][layout];
        const current = useTemplateStore.getState();
        if (templateId && current.defaults[category][layout] === null && existingIds.has(templateId)) {
          await current.makeDefault(category, layout, templateId);
        }
      }
    }
  }

  return result;
}