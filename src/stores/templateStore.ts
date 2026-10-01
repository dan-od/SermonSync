import { create } from "zustand";

import { createEmptyTemplate, loadTemplateThemes, saveTemplateThemes } from "../lib/templateStorage";
import type {
  TemplateBackgroundMedia,
  TemplateCategory,
  TemplateCanvasTheme,
  TemplateLayer,
  TemplateShapeLayer,
  TemplateTextLayer,
  TemplateThemeDocument,
} from "../types/templates";
import type { OverlayMode } from "../types/state";
import {
  resizeCanvas,
  withBackgroundMedia,
  withLayerDeleted,
  withLayerDuplicated,
  withLayerLockToggled,
  withLayerMovedBackward,
  withLayerMovedForward,
  withLayerVisibilityToggled,
  withNewShapeLayer,
  withNewTextLayer,
  withPatchedBackgroundMedia,
  withPatchedLayer,
  withPatchedShapeLayer,
  withPatchedTextLayer,
} from "./templateSceneUpdaters";

interface TemplateStore {
  initialized: boolean;
  loading: boolean;
  error: string | null;
  templates: TemplateCanvasTheme[];
  defaults: Record<TemplateCategory, Record<OverlayMode, string | null>>;
  initialize: () => Promise<void>;
  /** Re-read templates from disk (the projector window, after main saves). */
  reload: () => Promise<void>;
  upsertTemplate: (template: TemplateCanvasTheme) => Promise<void>;
  createTemplateDraft: (category: TemplateCategory) => TemplateCanvasTheme;
  makeDefault: (category: TemplateCategory, layout: OverlayMode, templateId: string) => Promise<void>;
  renameTemplate: (templateId: string, name: string) => Promise<void>;
  deleteTemplate: (templateId: string) => Promise<void>;
  duplicateTemplate: (templateId: string) => Promise<void>;
  patchTemplateScene: (
    templateId: string,
    updater: (current: TemplateCanvasTheme) => TemplateCanvasTheme,
  ) => TemplateCanvasTheme | null;
  updateCanvasSize: (templateId: string, width: number, height: number) => TemplateCanvasTheme | null;
  setBackgroundMedia: (templateId: string, media: TemplateBackgroundMedia | null) => TemplateCanvasTheme | null;
  patchBackgroundMedia: (templateId: string, patch: Partial<TemplateBackgroundMedia>) => TemplateCanvasTheme | null;
  addTextLayer: (templateId: string) => TemplateCanvasTheme | null;
  addShapeLayer: (templateId: string) => TemplateCanvasTheme | null;
  patchLayer: (templateId: string, layerId: string, patch: Partial<Omit<TemplateLayer, "type">>) => TemplateCanvasTheme | null;
  patchTextLayer: (templateId: string, layerId: string, patch: Partial<TemplateTextLayer>) => TemplateCanvasTheme | null;
  patchShapeLayer: (templateId: string, layerId: string, patch: Partial<TemplateShapeLayer>) => TemplateCanvasTheme | null;
  toggleLayerVisibility: (templateId: string, layerId: string) => TemplateCanvasTheme | null;
  toggleLayerLock: (templateId: string, layerId: string) => TemplateCanvasTheme | null;
  moveLayerForward: (templateId: string, layerId: string) => TemplateCanvasTheme | null;
  moveLayerBackward: (templateId: string, layerId: string) => TemplateCanvasTheme | null;
  duplicateLayer: (templateId: string, layerId: string) => TemplateCanvasTheme | null;
  deleteLayer: (templateId: string, layerId: string) => TemplateCanvasTheme | null;
}

function toDocument(templates: TemplateCanvasTheme[], defaults: Record<TemplateCategory, Record<OverlayMode, string | null>>): TemplateThemeDocument {
  return {
    version: 2,
    templates,
    defaults,
  };
}

// Every write goes through here so callers can wait for the file to land
// (the projector window re-reads templates from disk after a save).
let pendingSaves: Promise<unknown> = Promise.resolve();

function trackedSave(document: TemplateThemeDocument): Promise<void> {
  const save = saveTemplateThemes(document);
  pendingSaves = Promise.allSettled([pendingSaves, save]);
  return save;
}

/** Resolves once every template save started so far has finished. */
export function flushTemplateSaves(): Promise<void> {
  return pendingSaves.then(() => undefined);
}

function persist(templates: TemplateCanvasTheme[], defaults: Record<TemplateCategory, Record<OverlayMode, string | null>>) {
  // Fire-and-forget: persistence must never block the UI from reflecting scene edits instantly.
  void trackedSave(toDocument(templates, defaults)).catch((error) => {
    console.error("Failed to persist template themes", error);
  });
}

export const useTemplateStore = create<TemplateStore>((set, get) => ({
  initialized: false,
  loading: false,
  error: null,
  templates: [],
  defaults: {
    scriptures: { widescreen: null, "lower-third": null },
    songs: { widescreen: null, "lower-third": null },
  },

  initialize: async () => {
    if (get().initialized || get().loading) {
      return;
    }

    set({ loading: true, error: null });
    try {
      const data = await loadTemplateThemes();
      set({
        templates: data.templates,
        defaults: data.defaults,
        initialized: true,
        loading: false,
      });
    } catch (error) {
      set({
        loading: false,
        initialized: true,
        error: error instanceof Error ? error.message : "Failed to load templates",
      });
    }
  },

  reload: async () => {
    try {
      const data = await loadTemplateThemes();
      set({ templates: data.templates, defaults: data.defaults, initialized: true, loading: false, error: null });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Failed to reload templates" });
    }
  },

  upsertTemplate: async (template) => {
    const now = Date.now();
    const nextTemplate = { ...template, updatedAt: now };
    const existing = get().templates;
    const exists = existing.some((entry) => entry.id === template.id);
    const nextTemplates = exists
      ? existing.map((entry) => (entry.id === template.id ? nextTemplate : entry))
      : [nextTemplate, ...existing];

    const nextDefaults = {
      scriptures: { ...get().defaults.scriptures },
      songs: { ...get().defaults.songs },
    };
    (["scriptures", "songs"] as TemplateCategory[]).forEach((category) => {
      (["widescreen", "lower-third"] as OverlayMode[]).forEach((layout) => {
        if (nextDefaults[category][layout] === nextTemplate.id && (category !== nextTemplate.category || layout !== nextTemplate.layout)) {
          nextDefaults[category][layout] = null;
        }
      });
    });

    set({ templates: nextTemplates, defaults: nextDefaults });
    await trackedSave(toDocument(nextTemplates, nextDefaults));
  },

  createTemplateDraft: (category) => {
    const count = get().templates.filter((entry) => entry.category === category).length + 1;
    return createEmptyTemplate(category, count);
  },

  makeDefault: async (category, layout, templateId) => {
    const template = get().templates.find((entry) => entry.id === templateId && entry.category === category && entry.layout === layout);
    if (!template) {
      return;
    }

    const nextDefaults = { ...get().defaults, [category]: { ...get().defaults[category], [layout]: templateId } };
    set({ defaults: nextDefaults });
    await trackedSave(toDocument(get().templates, nextDefaults));
  },

  renameTemplate: async (templateId, name) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }

    const nextTemplates = get().templates.map((entry) =>
      entry.id === templateId ? { ...entry, name: trimmed, updatedAt: Date.now() } : entry,
    );

    set({ templates: nextTemplates });
    await trackedSave(toDocument(nextTemplates, get().defaults));
  },

  deleteTemplate: async (templateId) => {
    const target = get().templates.find((entry) => entry.id === templateId);
    if (!target) {
      return;
    }

    const nextTemplates = get().templates.filter((entry) => entry.id !== templateId);
    const nextDefaults = { ...get().defaults };

    (["widescreen", "lower-third"] as OverlayMode[]).forEach((layout) => {
      if (nextDefaults[target.category][layout] === templateId) nextDefaults[target.category][layout] = null;
    });

    set({ templates: nextTemplates, defaults: nextDefaults });
    await trackedSave(toDocument(nextTemplates, nextDefaults));
  },

  duplicateTemplate: async (templateId) => {
    const source = get().templates.find((entry) => entry.id === templateId);
    if (!source) {
      return;
    }

    const now = Date.now();
    const copy: TemplateCanvasTheme = {
      ...source,
      id: `tpl-${now}-${Math.random().toString(36).slice(2, 7)}`,
      name: `${source.name} Copy`,
      createdAt: now,
      updatedAt: now,
    };

    const nextTemplates = [copy, ...get().templates];
    set({ templates: nextTemplates });
    await trackedSave(toDocument(nextTemplates, get().defaults));
  },

  patchTemplateScene: (templateId, updater) => {
    const currentTheme = get().templates.find((entry) => entry.id === templateId);
    if (!currentTheme) {
      return null;
    }

    const nextTheme = { ...updater(currentTheme), updatedAt: Date.now() };
    const nextTemplates = get().templates.map((entry) =>
      entry.id === templateId ? nextTheme : entry,
    );
    set({ templates: nextTemplates });
    persist(nextTemplates, get().defaults);
    return nextTheme;
  },

  updateCanvasSize: (templateId, width, height) =>
    get().patchTemplateScene(templateId, (current) => resizeCanvas(current, width, height)),

  setBackgroundMedia: (templateId, media) =>
    get().patchTemplateScene(templateId, (current) => withBackgroundMedia(current, media)),

  patchBackgroundMedia: (templateId, patch) =>
    get().patchTemplateScene(templateId, (current) => withPatchedBackgroundMedia(current, patch)),

  addTextLayer: (templateId) =>
    get().patchTemplateScene(templateId, (current) => withNewTextLayer(current)),

  addShapeLayer: (templateId) =>
    get().patchTemplateScene(templateId, (current) => withNewShapeLayer(current)),

  patchLayer: (templateId, layerId, patch) =>
    get().patchTemplateScene(templateId, (current) => withPatchedLayer(current, layerId, patch)),

  patchTextLayer: (templateId, layerId, patch) =>
    get().patchTemplateScene(templateId, (current) => withPatchedTextLayer(current, layerId, patch)),

  patchShapeLayer: (templateId, layerId, patch) =>
    get().patchTemplateScene(templateId, (current) => withPatchedShapeLayer(current, layerId, patch)),

  toggleLayerVisibility: (templateId, layerId) =>
    get().patchTemplateScene(templateId, (current) => withLayerVisibilityToggled(current, layerId)),

  toggleLayerLock: (templateId, layerId) =>
    get().patchTemplateScene(templateId, (current) => withLayerLockToggled(current, layerId)),

  moveLayerForward: (templateId, layerId) =>
    get().patchTemplateScene(templateId, (current) => withLayerMovedForward(current, layerId)),

  moveLayerBackward: (templateId, layerId) =>
    get().patchTemplateScene(templateId, (current) => withLayerMovedBackward(current, layerId)),

  duplicateLayer: (templateId, layerId) =>
    get().patchTemplateScene(templateId, (current) => withLayerDuplicated(current, layerId)),

  deleteLayer: (templateId, layerId) =>
    get().patchTemplateScene(templateId, (current) => withLayerDeleted(current, layerId)),
}));
