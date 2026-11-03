import type { StoreApi } from "zustand";
import type { TemplateLayer, TemplateShapeLayer, TemplateTextLayer } from "../types/templates";
import { persist, type TemplateStore } from "./templateStoreHelpers";

type SceneUpdaterKeys =
  | "patchTemplateScene"
  | "updateCanvasSize"
  | "setBackgroundMedia"
  | "patchBackgroundMedia"
  | "addTextLayer"
  | "addShapeLayer"
  | "patchLayer"
  | "patchTextLayer"
  | "patchShapeLayer"
  | "toggleLayerVisibility"
  | "toggleLayerLock"
  | "moveLayerForward"
  | "moveLayerBackward"
  | "duplicateLayer"
  | "deleteLayer";

export function createTemplateSceneUpdaters(
  set: StoreApi<TemplateStore>["setState"],
  get: StoreApi<TemplateStore>["getState"],
): Pick<TemplateStore, SceneUpdaterKeys> {
  return {
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
          content: "Type here",
          color: "#f4f7ff",
          outlineColor: "",
          outlineWidth: 0,
          fontFamily: "Inter, system-ui, sans-serif",
          fontStyle: "normal",
          fontSize: 28,
          fontWeight: 700,
          align: "center",
          lineHeight: 1.2,
          autoFit: "none",
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
  };
}
