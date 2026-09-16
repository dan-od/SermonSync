/**
 * Template Studio — canvas object positioning guides.
 *
 * Draws Canva/Figma-style snap lines while dragging: canvas edges/center and
 * the edges/centers of other objects. Uses Fabric's `contextTop` overlay
 * (https://fabricjs.com/docs/) so guides render without triggering a full
 * object re-render, and are cleared on drop.
 */
import type { Canvas, FabricObject, TEvent, TPointerEvent } from "fabric";

const SNAP_THRESHOLD = 6;
const GUIDE_COLOR = "#ff3d9a";

interface Edges {
  left: number;
  right: number;
  centerX: number;
  top: number;
  bottom: number;
  centerY: number;
}

function edgesOf(rect: { left: number; top: number; width: number; height: number }): Edges {
  return {
    left: rect.left,
    right: rect.left + rect.width,
    centerX: rect.left + rect.width / 2,
    top: rect.top,
    bottom: rect.top + rect.height,
    centerY: rect.top + rect.height / 2,
  };
}

function toViewportPoint(canvas: Canvas, x: number, y: number) {
  const vpt = canvas.viewportTransform;
  return { x: x * vpt[0] + vpt[4], y: y * vpt[3] + vpt[5] };
}

/** Nearest snap target within threshold, or null if nothing is close enough. */
function nearest(value: number, targets: number[]): number | null {
  let best: number | null = null;
  let bestDelta = SNAP_THRESHOLD;
  for (const target of targets) {
    const delta = Math.abs(value - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = target;
    }
  }
  return best;
}

/** Attach snap-while-dragging guides to a canvas. Returns a detach function. */
export function attachAlignmentGuides(canvas: Canvas, getDocumentSize: () => { width: number; height: number }): () => void {
  const drawLine = (orientation: "vertical" | "horizontal", position: number) => {
    const { width: documentWidth, height: documentHeight } = getDocumentSize();
    const ctx = canvas.contextTop;
    ctx.save();
    ctx.strokeStyle = GUIDE_COLOR;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    if (orientation === "vertical") {
      const start = toViewportPoint(canvas, position, 0);
      const end = toViewportPoint(canvas, position, documentHeight);
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
    } else {
      const start = toViewportPoint(canvas, 0, position);
      const end = toViewportPoint(canvas, documentWidth, position);
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
    }
    ctx.stroke();
    ctx.restore();
  };

  const clearGuides = () => canvas.clearContext(canvas.contextTop);

  const onMoving = (event: TEvent<TPointerEvent> & { target: FabricObject }) => {
    const { width: documentWidth, height: documentHeight } = getDocumentSize();
    const target = event.target;
    const bounds = target.getBoundingRect();
    const moving = edgesOf(bounds);

    const verticalTargets = [0, documentWidth / 2, documentWidth];
    const horizontalTargets = [0, documentHeight / 2, documentHeight];
    for (const other of canvas.getObjects()) {
      if (other === target) continue;
      const otherEdges = edgesOf(other.getBoundingRect());
      verticalTargets.push(otherEdges.left, otherEdges.centerX, otherEdges.right);
      horizontalTargets.push(otherEdges.top, otherEdges.centerY, otherEdges.bottom);
    }

    clearGuides();

    const snapX = nearest(moving.left, verticalTargets) ?? nearest(moving.centerX, verticalTargets) ?? nearest(moving.right, verticalTargets);
    if (snapX !== null) {
      const matchLeft = Math.abs(moving.left - snapX) <= SNAP_THRESHOLD;
      const matchCenter = Math.abs(moving.centerX - snapX) <= SNAP_THRESHOLD;
      const shift = matchLeft ? snapX - moving.left : matchCenter ? snapX - moving.centerX : snapX - moving.right;
      target.set({ left: (target.left ?? 0) + shift });
      drawLine("vertical", snapX);
    }

    const snapY = nearest(moving.top, horizontalTargets) ?? nearest(moving.centerY, horizontalTargets) ?? nearest(moving.bottom, horizontalTargets);
    if (snapY !== null) {
      const matchTop = Math.abs(moving.top - snapY) <= SNAP_THRESHOLD;
      const matchCenter = Math.abs(moving.centerY - snapY) <= SNAP_THRESHOLD;
      const shift = matchTop ? snapY - moving.top : matchCenter ? snapY - moving.centerY : snapY - moving.bottom;
      target.set({ top: (target.top ?? 0) + shift });
      drawLine("horizontal", snapY);
    }
  };

  canvas.on("object:moving", onMoving);
  canvas.on("object:modified", clearGuides);
  canvas.on("mouse:up", clearGuides);

  return () => {
    canvas.off("object:moving", onMoving);
    canvas.off("object:modified", clearGuides);
    canvas.off("mouse:up", clearGuides);
    clearGuides();
  };
}
