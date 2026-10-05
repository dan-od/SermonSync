import type { TemplateBackgroundMedia } from "../types/templates";

export type CameraEditMode = "off" | "frame" | "crop";
export type CameraFrameHandle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export type CameraSnapGuides = { vertical: number[]; horizontal: number[] };

const MIN_SIZE = 5;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function transformCameraFrame(start: TemplateBackgroundMedia, handle: CameraFrameHandle, mode: CameraEditMode, dx: number, dy: number): TemplateBackgroundMedia {
  const x = start.x;
  const y = start.y;
  const right = x + start.width;
  const bottom = y + start.height;
  if (handle === "move") return { ...start, x: clamp(x + dx, 0, 100 - start.width), y: clamp(y + dy, 0, 100 - start.height) };

  const west = handle.includes("w");
  const east = handle.includes("e");
  const north = handle.includes("n");
  const south = handle.includes("s");
  if (mode === "frame") {
    const nextLeft = west ? clamp(x + dx, 0, right - MIN_SIZE) : x;
    const nextRight = east ? clamp(right + dx, nextLeft + MIN_SIZE, 100) : right;
    const nextTop = north ? clamp(y + dy, 0, bottom - MIN_SIZE) : y;
    const nextBottom = south ? clamp(bottom + dy, nextTop + MIN_SIZE, 100) : bottom;
    return { ...start, x: nextLeft, y: nextTop, width: nextRight - nextLeft, height: nextBottom - nextTop };
  }

  // Cropping changes the frame and source inset together, preserving the
  // scale of the remaining camera pixels.
  const visibleX = Math.max(5, 100 - (start.cropLeft ?? 0) - (start.cropRight ?? 0));
  const visibleY = Math.max(5, 100 - (start.cropTop ?? 0) - (start.cropBottom ?? 0));
  const nextLeft = west ? clamp(x + dx, Math.max(0, x - (start.cropLeft ?? 0) / visibleX * start.width), right - MIN_SIZE) : x;
  const nextRight = east ? clamp(right + dx, nextLeft + MIN_SIZE, Math.min(100, right + (start.cropRight ?? 0) / visibleX * start.width)) : right;
  const nextTop = north ? clamp(y + dy, Math.max(0, y - (start.cropTop ?? 0) / visibleY * start.height), bottom - MIN_SIZE) : y;
  const nextBottom = south ? clamp(bottom + dy, nextTop + MIN_SIZE, Math.min(100, bottom + (start.cropBottom ?? 0) / visibleY * start.height)) : bottom;
  return {
    ...start,
    x: nextLeft,
    y: nextTop,
    width: nextRight - nextLeft,
    height: nextBottom - nextTop,
    cropLeft: clamp((start.cropLeft ?? 0) + (nextLeft - x) / start.width * visibleX, 0, 95 - (start.cropRight ?? 0)),
    cropRight: clamp((start.cropRight ?? 0) - (nextRight - right) / start.width * visibleX, 0, 95 - (start.cropLeft ?? 0)),
    cropTop: clamp((start.cropTop ?? 0) + (nextTop - y) / start.height * visibleY, 0, 95 - (start.cropBottom ?? 0)),
    cropBottom: clamp((start.cropBottom ?? 0) - (nextBottom - bottom) / start.height * visibleY, 0, 95 - (start.cropTop ?? 0)),
  };
}

export function snapCameraFrame(
  start: TemplateBackgroundMedia,
  handle: CameraFrameHandle,
  mode: Exclude<CameraEditMode, "off">,
  dx: number,
  dy: number,
  targets: CameraSnapGuides,
  canvasSize: { width: number; height: number },
  thresholdPx = 8,
): { media: TemplateBackgroundMedia; guides: CameraSnapGuides } {
  const candidate = transformCameraFrame(start, handle, mode, dx, dy);
  const xEdges = handle === "move"
    ? [candidate.x, candidate.x + candidate.width / 2, candidate.x + candidate.width]
    : [handle.includes("w") ? candidate.x : handle.includes("e") ? candidate.x + candidate.width : NaN];
  const yEdges = handle === "move"
    ? [candidate.y, candidate.y + candidate.height / 2, candidate.y + candidate.height]
    : [handle.includes("n") ? candidate.y : handle.includes("s") ? candidate.y + candidate.height : NaN];
  const nearest = (values: number[], lines: number[], canvasPixels: number) => {
    let best: { delta: number; line: number } | null = null;
    for (const value of values) for (const line of lines) {
      const delta = line - value;
      if (Math.abs(delta) * canvasPixels / 100 <= thresholdPx && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, line };
    }
    return best;
  };
  const xSnap = nearest(xEdges, targets.vertical, canvasSize.width);
  const ySnap = nearest(yEdges, targets.horizontal, canvasSize.height);
  const media = xSnap || ySnap
    ? transformCameraFrame(start, handle, mode, dx + (xSnap?.delta ?? 0), dy + (ySnap?.delta ?? 0))
    : candidate;
  const xResult = handle === "move" ? [media.x, media.x + media.width / 2, media.x + media.width] : [handle.includes("w") ? media.x : handle.includes("e") ? media.x + media.width : NaN];
  const yResult = handle === "move" ? [media.y, media.y + media.height / 2, media.y + media.height] : [handle.includes("n") ? media.y : handle.includes("s") ? media.y + media.height : NaN];
  return {
    media,
    guides: {
      vertical: targets.vertical.filter((line) => xResult.some((value) => Math.abs(value - line) * canvasSize.width / 100 <= thresholdPx)),
      horizontal: targets.horizontal.filter((line) => yResult.some((value) => Math.abs(value - line) * canvasSize.height / 100 <= thresholdPx)),
    },
  };
}
