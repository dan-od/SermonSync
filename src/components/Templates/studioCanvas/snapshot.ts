import { Canvas, FabricObject } from "fabric";
import { type StudioDocument, type StudioFabricObjectData } from "../../../types/studioDocument";
import { type StudioCanvasSnapshot } from "./types";

const STUDIO_MEDIA_PATTERN_PLACEHOLDER = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAwUBAQJk7uUAAAAASUVORK5CYII=";

function compactSnapshotObject(object: StudioFabricObjectData): StudioFabricObjectData {
  const fill = object.fill;
  if (!object.studioShapeFillMediaSource || !fill || typeof fill !== "object" || (fill as Record<string, unknown>).type !== "pattern") {
    return object;
  }
  return {
    ...object,
    fill: {
      ...(fill as Record<string, unknown>),
      source: STUDIO_MEDIA_PATTERN_PLACEHOLDER,
    },
  };
}

export function canvasSnapshot(canvas: Canvas, document: StudioDocument): StudioCanvasSnapshot {
  const exported = canvas.toObject();
  return {
    objects: (exported.objects as StudioFabricObjectData[]).map(compactSnapshotObject),
    background: typeof exported.background === "string" ? exported.background : "",
    backgroundMode: document.backgroundMode,
    backgroundMedia: document.backgroundMedia,
    cameraMedia: document.cameraMedia,
  };
}

export function snapshotsEqual(left: StudioCanvasSnapshot, right: StudioCanvasSnapshot): boolean {
  // Do not stringify media sources or Fabric pattern payloads just to decide
  // whether an edit created a history entry. Compare a compact projection with
  // a short source signature so replacing media still creates an undo point.
  const sourceSignature = (source: unknown) => {
    if (typeof source !== "string") return source;
    if (source.length <= 160) return source;
    return `${source.length}:${source.slice(0, 64)}:${source.slice(-64)}`;
  };
  const compact = (snapshot: StudioCanvasSnapshot) => snapshot.objects.map((object) => {
    const rest = { ...object };
    if ("studioShapeFillMediaSource" in rest) {
      rest.studioShapeFillMediaSource = sourceSignature(rest.studioShapeFillMediaSource);
    }
    const fill = rest.fill;
    const compactFill = fill && typeof fill === "object"
      ? { ...(fill as Record<string, unknown>), source: undefined }
      : fill;
    return { ...rest, fill: compactFill };
  });
  const media = (snapshot: StudioCanvasSnapshot) => snapshot.backgroundMedia
    ? { ...snapshot.backgroundMedia, src: sourceSignature(snapshot.backgroundMedia.src) }
    : null;
  const camera = (snapshot: StudioCanvasSnapshot) => snapshot.cameraMedia
    ? { ...snapshot.cameraMedia, src: sourceSignature(snapshot.cameraMedia.src) }
    : null;
  return left.background === right.background
    && left.backgroundMode === right.backgroundMode
    && JSON.stringify(media(left)) === JSON.stringify(media(right))
    && JSON.stringify(camera(left)) === JSON.stringify(camera(right))
    && JSON.stringify(compact(left)) === JSON.stringify(compact(right));
}

let studioObjectSequence = 0;
export function nextStudioId(prefix: string): string {
  studioObjectSequence += 1;
  return `${prefix}-${Date.now()}-${studioObjectSequence}`;
}

export function nextStudioName(canvas: Canvas, label: string): string {
  const count = canvas.getObjects().filter((object) => object.studioName?.startsWith(label)).length;
  return `${label} ${count + 1}`;
}

export function findByStudioId(canvas: Canvas, studioId: string): FabricObject | undefined {
  return canvas.getObjects().find((object) => object.studioId === studioId);
}
