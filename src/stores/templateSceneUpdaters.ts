import type {
  TemplateBackgroundMedia,
  TemplateCanvasTheme,
  TemplateLayer,
  TemplateShapeLayer,
  TemplateTextLayer,
} from "../types/templates";

/*
 * Pure scene updaters used by templateStore's patchTemplateScene actions.
 * Each takes the current theme and returns the next one; the store stamps
 * updatedAt and persists.
 */

export function resizeCanvas(current: TemplateCanvasTheme, width: number, height: number): TemplateCanvasTheme {
  return {
    ...current,
    scene: {
      ...current.scene,
      canvasWidth: Math.max(320, Math.round(width)),
      canvasHeight: Math.max(180, Math.round(height)),
    },
  };
}

export function withBackgroundMedia(current: TemplateCanvasTheme, media: TemplateBackgroundMedia | null): TemplateCanvasTheme {
  return {
    ...current,
    scene: {
      ...current.scene,
      backgroundMedia: media,
    },
  };
}

export function withPatchedBackgroundMedia(
  current: TemplateCanvasTheme,
  patch: Partial<TemplateBackgroundMedia>,
): TemplateCanvasTheme {
  return {
    ...current,
    scene: {
      ...current.scene,
      backgroundMedia: current.scene.backgroundMedia ? { ...current.scene.backgroundMedia, ...patch } : null,
    },
  };
}

export function withNewTextLayer(current: TemplateCanvasTheme): TemplateCanvasTheme {
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
}

export function withNewShapeLayer(current: TemplateCanvasTheme): TemplateCanvasTheme {
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
}

export function withPatchedLayer(
  current: TemplateCanvasTheme,
  layerId: string,
  patch: Partial<Omit<TemplateLayer, "type">>,
): TemplateCanvasTheme {
  return {
    ...current,
    scene: {
      ...current.scene,
      layers: current.scene.layers.map((layer) =>
        layer.id === layerId ? { ...layer, ...patch } : layer,
      ),
    },
  };
}

export function withPatchedTextLayer(
  current: TemplateCanvasTheme,
  layerId: string,
  patch: Partial<TemplateTextLayer>,
): TemplateCanvasTheme {
  return {
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
  };
}

export function withPatchedShapeLayer(
  current: TemplateCanvasTheme,
  layerId: string,
  patch: Partial<TemplateShapeLayer>,
): TemplateCanvasTheme {
  return {
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
  };
}

export function withLayerVisibilityToggled(current: TemplateCanvasTheme, layerId: string): TemplateCanvasTheme {
  return {
    ...current,
    scene: {
      ...current.scene,
      layers: current.scene.layers.map((layer) =>
        layer.id === layerId ? { ...layer, visible: !layer.visible } : layer,
      ),
    },
  };
}

export function withLayerLockToggled(current: TemplateCanvasTheme, layerId: string): TemplateCanvasTheme {
  return {
    ...current,
    scene: {
      ...current.scene,
      layers: current.scene.layers.map((layer) =>
        layer.id === layerId ? { ...layer, locked: !layer.locked } : layer,
      ),
    },
  };
}

export function withLayerMovedForward(current: TemplateCanvasTheme, layerId: string): TemplateCanvasTheme {
  return {
    ...current,
    scene: {
      ...current.scene,
      layers: current.scene.layers.map((layer) =>
        layer.id === layerId ? { ...layer, zIndex: layer.zIndex + 1 } : layer,
      ),
    },
  };
}

export function withLayerMovedBackward(current: TemplateCanvasTheme, layerId: string): TemplateCanvasTheme {
  return {
    ...current,
    scene: {
      ...current.scene,
      layers: current.scene.layers.map((layer) =>
        layer.id === layerId
          ? { ...layer, zIndex: Math.max(0, layer.zIndex - 1) }
          : layer,
      ),
    },
  };
}

export function withLayerDuplicated(current: TemplateCanvasTheme, layerId: string): TemplateCanvasTheme {
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
}

export function withLayerDeleted(current: TemplateCanvasTheme, layerId: string): TemplateCanvasTheme {
  return {
    ...current,
    scene: {
      ...current.scene,
      layers: current.scene.layers.filter((layer) => layer.id !== layerId),
    },
  };
}
