import { type Ref } from "react";
import type { Canvas } from "fabric";
import { type StudioBackgroundMode, type StudioDocument, type StudioFabricObjectData } from "../../../types/studioDocument";
import { type TemplateBackgroundMedia } from "../../../types/templates";
import { type CameraEditMode } from "../../../lib/cameraFrame";

export type StudioShapeKind = "rectangle" | "square" | "circle" | "triangle" | "line" | "arrow" | "polygon" | "star";

export interface StudioCanvasHandle {
  addText: (box: { x: number; y: number; width: number; height: number }) => void;
  addShape: (kind: StudioShapeKind, box: { x: number; y: number; width: number; height: number }) => void;
  addImage: (source: string, name?: string, mediaType?: "image" | "video") => Promise<void>;
  setShapeMedia: (studioId: string, source: string | null, name?: string, mediaType?: "image" | "video") => Promise<void>;
  copySelection: () => Promise<boolean>;
  pasteSelection: () => Promise<boolean>;
  groupSelection: () => boolean;
  ungroupSelection: () => boolean;
  deleteSelection: () => void;
  selectById: (studioId: string) => void;
  setVisible: (studioId: string, visible: boolean) => void;
  setLocked: (studioId: string, locked: boolean) => void;
  toDocument: () => StudioDocument;
  getCanvas: () => Canvas | null;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  setBackground: (background: string) => void;
  setBackgroundConfig: (config: { mode: StudioBackgroundMode; color?: string; gradientStart?: string; gradientEnd?: string; gradientAngle?: number; gradientStyle?: StudioDocument["backgroundGradientStyle"]; backgroundBlur?: number; media?: StudioDocument["backgroundMedia"] }) => void;
  setCameraMedia: (media: TemplateBackgroundMedia | null) => void;
  updateObject: (studioId: string, props: Record<string, unknown>) => void;
  reorderObject: (studioId: string, direction: "front" | "forward" | "backward" | "back") => void;
}

export interface StudioTextSelection {
  studioId: string;
  start: number;
  end: number;
  /** Only properties with one effective value across the range are included. */
  styles: Record<string, unknown>;
}

export interface FabricStudioCanvasProps {
  document: StudioDocument;
  cameraEditMode?: CameraEditMode;
  onSelectionChange: (studioIds: string[]) => void;
  onTextSelectionChange: (selection: StudioTextSelection | null) => void;
  onDocumentChange: (patch: Partial<Pick<StudioDocument, "objects" | "background" | "backgroundMode" | "backgroundColor" | "backgroundGradientStart" | "backgroundGradientEnd" | "backgroundGradientAngle" | "backgroundGradientStyle" | "backgroundBlur" | "backgroundMedia" | "cameraMedia" | "updatedAt">>) => void;
  onHistoryChange: (history: { canUndo: boolean; canRedo: boolean }) => void;
  handleRef?: Ref<StudioCanvasHandle>;
}

export interface StudioCanvasSnapshot {
  objects: StudioFabricObjectData[];
  background: string;
  backgroundMode?: StudioBackgroundMode;
  backgroundMedia?: TemplateBackgroundMedia | null;
  cameraMedia?: TemplateBackgroundMedia | null;
}

// Fabric's Pattern serializer includes the complete image data URI in `fill`.
// Media shapes already keep their source in studioShapeFillMediaSource, so a
// tiny placeholder is enough for the serialized Fabric fill. This keeps history
// and save operations from copying the same image payload twice.
