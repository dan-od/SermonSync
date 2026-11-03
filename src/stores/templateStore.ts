import { create } from "zustand";

import { createEmptyTemplate, loadTemplateThemes, saveTemplateThemes } from "../lib/templateStorage";
import { isStagedTemplateVideo, stageTemplateVideo } from "../lib/templateVideo";
import { importErrorMessage, importVideo, isManagedVideo } from "../lib/videoImport";
import { warmDefaultTemplateVideos } from "../lib/templateVideoWarmup";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { TemplateCategory, TemplateCanvasTheme } from "../types/templates";
import type { OverlayMode } from "../types/state";
import { createTemplateSceneUpdaters } from "./templateSceneUpdaters";
import { toDocument, type TemplateStore } from "./templateStoreHelpers";

let latestLoadRequest = 0;
const migratingTemplateSources = new Set<string>();

export function finishSavedTemplateVideo(templateId: string, stagedPath: string): void {
  if (!isStagedTemplateVideo(stagedPath)) return;
  void importVideo(stagedPath, { legacy: true }).then((asset) => {
    const preparedPath = asset.path;
    const store = useTemplateStore.getState();
    const currentTemplate = store.templates.find((template) => template.id === templateId);
    if (currentTemplate?.scene.backgroundMedia?.src !== stagedPath && currentTemplate?.studioDocument?.backgroundMedia?.src !== stagedPath) return;
    store.patchTemplateScene(templateId, (current) => ({
      ...current,
      scene: {
        ...current.scene,
        backgroundMedia: current.scene.backgroundMedia?.src === stagedPath
          ? { ...current.scene.backgroundMedia, src: preparedPath }
          : current.scene.backgroundMedia,
      },
      studioDocument: current.studioDocument ? {
        ...current.studioDocument,
        backgroundMedia: current.studioDocument.backgroundMedia?.src === stagedPath
          ? { ...current.studioDocument.backgroundMedia, src: preparedPath }
          : current.studioDocument.backgroundMedia,
      } : undefined,
    }));
  }).catch((error: unknown) => {
    console.error("Failed to prepare saved template video", error);
    useTemplateStore.setState({ error: error instanceof Error ? error.message : "Failed to prepare template video" });
  });
}

function resumeSavedTemplateVideos(templates: TemplateCanvasTheme[]): void {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window) || getCurrentWindow().label !== "main") return;
  for (const template of templates) {
    const sources = new Set<string>();
    for (const media of [template.scene.backgroundMedia, template.studioDocument?.backgroundMedia]) {
      if (media?.type === "video" && media.src && !isManagedVideo(media.src)) sources.add(media.src);
    }
    for (const layer of template.scene.layers) {
      if (layer.type === "shape" && layer.fillImageType === "video" && layer.fillImage && !isManagedVideo(layer.fillImage)) sources.add(layer.fillImage);
    }
    for (const object of template.studioDocument?.objects ?? []) {
      if (object.studioShapeFillMediaType === "video" && typeof object.studioShapeFillMediaSource === "string" && !isManagedVideo(object.studioShapeFillMediaSource)) {
        sources.add(object.studioShapeFillMediaSource);
      }
    }
    for (const source of sources) {
      const migrationKey = `${template.id}:${source}`;
      if (migratingTemplateSources.has(migrationKey)) continue;
      migratingTemplateSources.add(migrationKey);
      void (async () => {
        const local = source.startsWith("data:") ? await stageTemplateVideo(source) : source;
        if (!local.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(local)) return;
        const asset = await importVideo(local, { legacy: true });
        useTemplateStore.getState().patchTemplateScene(template.id, (current) => ({
          ...current,
          scene: {
            ...current.scene,
            backgroundMedia: current.scene.backgroundMedia?.type === "video" && current.scene.backgroundMedia.src === source
              ? { ...current.scene.backgroundMedia, src: asset.path } : current.scene.backgroundMedia,
            layers: current.scene.layers.map((layer) => layer.type === "shape" && layer.fillImageType === "video" && layer.fillImage === source
              ? { ...layer, fillImage: asset.path } : layer),
          },
          studioDocument: current.studioDocument ? {
            ...current.studioDocument,
            backgroundMedia: current.studioDocument.backgroundMedia?.type === "video" && current.studioDocument.backgroundMedia.src === source
              ? { ...current.studioDocument.backgroundMedia, src: asset.path } : current.studioDocument.backgroundMedia,
            objects: current.studioDocument.objects.map((object) =>
              object.studioShapeFillMediaType === "video" && object.studioShapeFillMediaSource === source
                ? { ...object, studioShapeFillMediaSource: asset.path } : object),
          } : undefined,
        }));
      })().catch((error) => {
        console.warn("Existing template video remains in place until migration succeeds", importErrorMessage(error));
      }).finally(() => migratingTemplateSources.delete(migrationKey));
    }
  }
}

export const useTemplateStore = create<TemplateStore>((set, get) => ({
  initialized: false,
  loading: false,
  error: null,
  templates: [],
  defaults: {
    scriptures: { widescreen: null, "lower-third": null, "split-screen": null },
    songs: { widescreen: null, "lower-third": null, "split-screen": null },
  },

  initialize: async () => {
    if (get().initialized || get().loading) {
      return;
    }

    const request = ++latestLoadRequest;
    set({ loading: true, error: null });
    try {
      const data = await loadTemplateThemes();
      if (request !== latestLoadRequest) return;
      set({
        templates: data.templates,
        defaults: data.defaults,
        initialized: true,
        loading: false,
      });
      resumeSavedTemplateVideos(data.templates);
      warmDefaultTemplateVideos(data);
    } catch (error) {
      if (request !== latestLoadRequest) return;
      set({
        loading: false,
        initialized: true,
        error: error instanceof Error ? error.message : "Failed to load templates",
      });
    }
  },

  reload: async () => {
    const request = ++latestLoadRequest;
    try {
      const data = await loadTemplateThemes();
      if (request !== latestLoadRequest) return;
      set({ templates: data.templates, defaults: data.defaults, initialized: true, loading: false, error: null });
      resumeSavedTemplateVideos(data.templates);
      warmDefaultTemplateVideos(data);
    } catch (error) {
      if (request !== latestLoadRequest) return;
      set({ loading: false, error: error instanceof Error ? error.message : "Failed to reload templates" });
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
      (["widescreen", "lower-third", "split-screen"] as OverlayMode[]).forEach((layout) => {
        if (nextDefaults[category][layout] === nextTemplate.id && (category !== nextTemplate.category || layout !== nextTemplate.layout)) {
          nextDefaults[category][layout] = null;
        }
      });
    });

    set({ templates: nextTemplates, defaults: nextDefaults });
    await saveTemplateThemes(toDocument(nextTemplates, nextDefaults));
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
    await saveTemplateThemes(toDocument(get().templates, nextDefaults));
  },

  setDefaultBackground: async (category, media) => {
    const defaultIds = new Set(Object.values(get().defaults[category]).filter((id): id is string => Boolean(id)));
    const templates = get().templates;
    const updatedAt = Date.now();
    let updatedCount = 0;
    const nextTemplates = templates.map((template) => {
      if (template.category !== category || !defaultIds.has(template.id)) return template;
      updatedCount += 1;
      return {
        ...template,
        updatedAt,
        scene: { ...template.scene, backgroundMedia: media },
        studioDocument: template.studioDocument ? {
          ...template.studioDocument,
          backgroundMode: "media" as const,
          backgroundMedia: media,
        } : undefined,
      };
    });
    if (updatedCount === 0) return 0;

    set({ templates: nextTemplates });
    await saveTemplateThemes(toDocument(nextTemplates, get().defaults));
    return updatedCount;
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
    await saveTemplateThemes(toDocument(nextTemplates, get().defaults));
  },

  deleteTemplate: async (templateId) => {
    const target = get().templates.find((entry) => entry.id === templateId);
    if (!target) {
      return;
    }

    const nextTemplates = get().templates.filter((entry) => entry.id !== templateId);
    const nextDefaults = { ...get().defaults };

    (["widescreen", "lower-third", "split-screen"] as OverlayMode[]).forEach((layout) => {
      if (nextDefaults[target.category][layout] === templateId) nextDefaults[target.category][layout] = null;
    });

    set({ templates: nextTemplates, defaults: nextDefaults });
    await saveTemplateThemes(toDocument(nextTemplates, nextDefaults));
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
    await saveTemplateThemes(toDocument(nextTemplates, get().defaults));
  },
  ...createTemplateSceneUpdaters(set, get),
}));
