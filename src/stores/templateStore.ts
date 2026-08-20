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

interface TemplateStore {
  initialized: boolean;
  loading: boolean;
  error: string | null;
  templates: TemplateCanvasTheme[];
  defaults: Record<TemplateCategory, string | null>;
  initialize: () => Promise<void>;
  upsertTemplate: (template: TemplateCanvasTheme) => Promise<void>;
  createTemplateDraft: (category: TemplateCategory) => TemplateCanvasTheme;
  makeDefault: (category: TemplateCategory, templateId: string) => Promise<void>;
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

function toDocument(templates: TemplateCanvasTheme[], defaults: Record<TemplateCategory, string | null>): TemplateThemeDocument {
  return {
    version: 1,
    templates,
    defaults,
  };
}

function persist(templates: TemplateCanvasTheme[], defaults: Record<TemplateCategory, string | null>) {
  // Fire-and-forget: persistence must never block the UI from reflecting scene edits instantly.
  void saveTemplateThemes(toDocument(templates, defaults)).catch((error) => {
    console.error("Failed to persist template themes", error);
  });
}

export const useTemplateStore = create<TemplateStore>((set, get) => ({
  initialized: false,
  loading: false,
  error: null,
  templates: [],
  defaults: {
    scriptures: null,
    songs: null,
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

  upsertTemplate: async (template) => {
    const now = Date.now();
    const nextTemplate = { ...template, updatedAt: now };
    const existing = get().templates;
    const exists = existing.some((entry) => entry.id === template.id);
    const nextTemplates = exists
      ? existing.map((entry) => (entry.id === template.id ? nextTemplate : entry))
      : [nextTemplate, ...existing];

    const nextDefaults = { ...get().defaults };
    if (!nextDefaults[nextTemplate.category]) {
      nextDefaults[nextTemplate.category] = nextTemplate.id;
    }

    set({ templates: nextTemplates, defaults: nextDefaults });
    await saveTemplateThemes(toDocument(nextTemplates, nextDefaults));
  },

  createTemplateDraft: (category) => {
    const count = get().templates.filter((entry) => entry.category === category).length + 1;
    return createEmptyTemplate(category, count);
  },

  makeDefault: async (category, templateId) => {
    const nextDefaults = { ...get().defaults, [category]: templateId };
    set({ defaults: nextDefaults });
    await saveTemplateThemes(toDocument(get().templates, nextDefaults));
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

    if (nextDefaults[target.category] === templateId) {
      nextDefaults[target.category] = nextTemplates.find((entry) => entry.category === target.category)?.id ?? null;
    }

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
    get().patchTemplateScene(templateId, (current) => ({
      ...current,
      scene: {
        ...current.scene,
        canvasWidth: Math.max(320, Math.round(width)),
        canvasHeight: Math.max(180, Math.round(height)),
      },
    })),

  setBackgroundMedia: (templateId, media) =>
    get().patchTemplateScene(templateId, (current) => ({
      ...current,
      scene: {
        ...current.scene,
        backgroundMedia: media,
      },
    })),

  patchBackgroundMedia: (templateId, patch) =>
    get().patchTemplateScene(templateId, (current) => ({
      ...current,
      scene: {
        ...current.scene,
        backgroundMedia: current.scene.backgroundMedia ? { ...current.scene.backgroundMedia, ...patch } : null,
      },
    })),

  addTextLayer: (templateId) =>
    get().patchTemplateScene(templateId, (current) => {
      const maxZ = Math.max(0, ...current.scene.layers.map((layer) => layer.zIndex));
      const nextIndex = current.scene.layers.filter((layer) => layer.type === "text").length + 1;
      const layer: TemplateTextLayer = {
        id: `text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: `Text ${nextIndex}`,
        type: "text",
        visible: true,
        locked: false,
        x: 20,
        y: 20,
        width: 55,
        height: 18,
        rotation: 0,
        zIndex: maxZ + 1,
        opacity: 1,
        content: "",
        color: "#f4f7ff",
        outlineColor: "",
        outlineWidth: 0,
        fontFamily: "var(--font-sans)",
        fontStyle: "normal",
        fontSize: 28,
        fontWeight: 700,
        align: "center",
        lineHeight: 1.2,
      };

      return {
        ...current,
        scene: {
          ...current.scene,
          layers: [...current.scene.layers, layer],
        },
      };
    }),

  addShapeLayer: (templateId) =>
    get().patchTemplateScene(templateId, (current) => {
      const maxZ = Math.max(0, ...current.scene.layers.map((layer) => layer.zIndex));
      const nextIndex = current.scene.layers.filter((layer) => layer.type === "shape").length + 1;
      const layer: TemplateShapeLayer = {
        id: `shape-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: `Shape ${nextIndex}`,
        type: "shape",
        shapeKind: "rectangle",
        visible: true,
        locked: false,
        x: 24,
        y: 24,
        width: 44,
        height: 18,
        rotation: 0,
        zIndex: maxZ + 1,
        opacity: 0.8,
        fill: "#101319",
        borderColor: current.accent,
        borderWidth: 1,
        radius: 10,
      };

      return {
        ...current,
        scene: {
          ...current.scene,
          layers: [...current.scene.layers, layer],
        },
      };
    }),

  patchLayer: (templateId, layerId, patch) =>
    get().patchTemplateScene(templateId, (current) => ({
      ...current,
      scene: {
        ...current.scene,
        layers: current.scene.layers.map((layer) =>
          layer.id === layerId ? { ...layer, ...patch } : layer,
        ),
      },
    })),

  patchTextLayer: (templateId, layerId, patch) =>
    get().patchTemplateScene(templateId, (current) => ({
      ...current,
      scene: {
        ...current.scene,
        layers: current.scene.layers.map((layer) => {
          if (layer.id !== layerId || layer.type !== "text") {
            return layer;
          }
          return { ...layer, ...patch };
        }),
      },
    })),

  patchShapeLayer: (templateId, layerId, patch) =>
    get().patchTemplateScene(templateId, (current) => ({
      ...current,
      scene: {
        ...current.scene,
        layers: current.scene.layers.map((layer) => {
          if (layer.id !== layerId || layer.type !== "shape") {
            return layer;
          }
          return { ...layer, ...patch };
        }),
      },
    })),

  toggleLayerVisibility: (templateId, layerId) =>
    get().patchTemplateScene(templateId, (current) => ({
      ...current,
      scene: {
        ...current.scene,
        layers: current.scene.layers.map((layer) =>
          layer.id === layerId ? { ...layer, visible: !layer.visible } : layer,
        ),
      },
    })),

  toggleLayerLock: (templateId, layerId) =>
    get().patchTemplateScene(templateId, (current) => ({
      ...current,
      scene: {
        ...current.scene,
        layers: current.scene.layers.map((layer) =>
          layer.id === layerId ? { ...layer, locked: !layer.locked } : layer,
        ),
      },
    })),

  moveLayerForward: (templateId, layerId) =>
    get().patchTemplateScene(templateId, (current) => ({
      ...current,
      scene: {
        ...current.scene,
        layers: current.scene.layers.map((layer) =>
          layer.id === layerId ? { ...layer, zIndex: layer.zIndex + 1 } : layer,
        ),
      },
    })),

  moveLayerBackward: (templateId, layerId) =>
    get().patchTemplateScene(templateId, (current) => ({
      ...current,
      scene: {
        ...current.scene,
        layers: current.scene.layers.map((layer) =>
          layer.id === layerId
            ? { ...layer, zIndex: Math.max(0, layer.zIndex - 1) }
            : layer,
        ),
      },
    })),

  duplicateLayer: (templateId, layerId) =>
    get().patchTemplateScene(templateId, (current) => {
      const source = current.scene.layers.find((layer) => layer.id === layerId);
      if (!source) {
        return current;
      }

      const maxZ = Math.max(0, ...current.scene.layers.map((layer) => layer.zIndex));
      const copy: TemplateLayer = {
        ...source,
        id: `${source.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: `${source.name} Copy`,
        x: Math.min(95, source.x + 2),
        y: Math.min(95, source.y + 2),
        zIndex: maxZ + 1,
      };

      return {
        ...current,
        scene: {
          ...current.scene,
          layers: [...current.scene.layers, copy],
        },
      };
    }),

  deleteLayer: (templateId, layerId) =>
    get().patchTemplateScene(templateId, (current) => ({
      ...current,
      scene: {
        ...current.scene,
        layers: current.scene.layers.filter((layer) => layer.id !== layerId),
      },
    })),
}));
