/**
 * Template Studio — canonical document model.
 *
 * Per https://fabricjs.com/docs/core-concepts/#json: "Every fabricJS object is
 * equipped with its own toObject method... This state is supposed to restore
 * the visual state of the canvas." Rather than re-deriving a parallel
 * per-layer schema, `objects` is exactly what `canvas.toObject().objects`
 * produces and what `canvas.loadFromJSON()` consumes.
 *
 * This type is independent from `types/templates.ts` (TemplateScene /
 * TemplateLayer), which remains owned by the existing Local Library template
 * list and the ProjectorView output renderer.
 */
import type { CanvasOptions } from "fabric";
import type { TemplateBackgroundMedia } from "./templates";

export type StudioCategory = "scriptures" | "songs";
export type StudioBackgroundMode = "color" | "gradient" | "media";

/** One serialized Fabric object, as produced by FabricObject#toObject(). */
export type StudioFabricObjectData = Record<string, unknown>;

export interface StudioDocument {
  id: string;
  name: string;
  category: StudioCategory;
  width: number;
  height: number;
  background: string;
  backgroundMode?: StudioBackgroundMode;
  backgroundColor?: string;
  backgroundGradientStart?: string;
  backgroundGradientEnd?: string;
  backgroundGradientAngle?: number;
  backgroundGradientStyle?: "linear" | "radial" | "conic";
  backgroundBlur?: number;
  backgroundMedia?: TemplateBackgroundMedia | null;
  /** Fabric's own schema version, from Canvas#toObject().version. */
  fabricVersion: string;
  objects: StudioFabricObjectData[];
  createdAt: number;
  updatedAt: number;
}

export const STUDIO_DOCUMENT_WIDTH = 1920;
export const STUDIO_DOCUMENT_HEIGHT = 1080;
export const STUDIO_DOCUMENT_BACKGROUND = "#0f1117";

export function createEmptyStudioDocument(category: StudioCategory, name: string): StudioDocument {
  const now = Date.now();
  return {
    id: `studio-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    category,
    width: STUDIO_DOCUMENT_WIDTH,
    height: STUDIO_DOCUMENT_HEIGHT,
    background: STUDIO_DOCUMENT_BACKGROUND,
    fabricVersion: "6.0.0",
    objects: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Canvas construction options derived from a document's dimensions/background. */
export function studioDocumentToCanvasOptions(document: StudioDocument): Partial<CanvasOptions> {
  return {
    width: document.width,
    height: document.height,
    backgroundColor: document.background,
  };
}
