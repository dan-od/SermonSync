import type { Dispatch, Ref, RefObject, SetStateAction } from "react";
import type { Canvas, FabricObject } from "fabric";

import type { StudioBackgroundMode, StudioDocument, StudioFabricObjectData } from "../../../types/studioDocument";

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
  onSelectionChange: (studioIds: string[]) => void;
  onTextSelectionChange: (selection: StudioTextSelection | null) => void;
  onDocumentChange: (patch: Partial<Pick<StudioDocument, "objects" | "background" | "backgroundMode" | "backgroundColor" | "backgroundGradientStart" | "backgroundGradientEnd" | "backgroundGradientAngle" | "backgroundGradientStyle" | "backgroundBlur" | "backgroundMedia" | "updatedAt">>) => void;
  onHistoryChange: (history: { canUndo: boolean; canRedo: boolean }) => void;
  handleRef?: Ref<StudioCanvasHandle>;
}

export interface StudioCanvasSnapshot {
  objects: StudioFabricObjectData[];
  background: string;
}

export type StudioCanvasCallbacks = Pick<FabricStudioCanvasProps, "onSelectionChange" | "onTextSelectionChange" | "onDocumentChange" | "onHistoryChange">;

export type StudioGuides = { vertical: number[]; horizontal: number[] };

/** The component-owned refs that the canvas setup and imperative handle read and write. */
export interface StudioCanvasRefs {
  clipboardRef: RefObject<FabricObject[]>;
  pasteOffsetRef: RefObject<number>;
  canvasRef: RefObject<Canvas | null>;
  documentRef: RefObject<StudioDocument>;
  callbacksRef: RefObject<StudioCanvasCallbacks>;
  textSelectionRef: RefObject<Map<string, { start: number; end: number }>>;
  historyPastRef: RefObject<StudioCanvasSnapshot[]>;
  historyFutureRef: RefObject<StudioCanvasSnapshot[]>;
  lastSnapshotRef: RefObject<StudioCanvasSnapshot | null>;
  restoringHistoryRef: RefObject<boolean>;
  historyOperationRef: RefObject<Promise<void> | null>;
  undoRef: RefObject<() => Promise<void>>;
  redoRef: RefObject<() => Promise<void>>;
  emitDocumentChangeRef: RefObject<() => void>;
  shapeMediaVideosRef: RefObject<Map<string, HTMLVideoElement>>;
  mediaEditTargetRef: RefObject<FabricObject | null>;
  mediaResizeStartRef: RefObject<{ target: FabricObject; scaleX: number; scaleY: number; mediaScale: number } | null>;
}

export type StudioCanvasSetupRefs = Omit<StudioCanvasRefs, "clipboardRef" | "pasteOffsetRef">;

export type StudioCanvasHandleRefs = Pick<StudioCanvasRefs, "clipboardRef" | "pasteOffsetRef" | "canvasRef" | "documentRef" | "callbacksRef" | "textSelectionRef" | "undoRef" | "redoRef" | "emitDocumentChangeRef" | "shapeMediaVideosRef">;

export type StudioGuidesSetter = Dispatch<SetStateAction<StudioGuides>>;
