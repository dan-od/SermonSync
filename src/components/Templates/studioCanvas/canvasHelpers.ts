import type { Canvas, FabricObject } from "fabric";
import type { StudioDocument } from "../../../types/studioDocument";

/** Snaps the moving target to nearby guide lines and returns the lines to draw. */
export function snapToGuides(canvas: Canvas, target: FabricObject, document: StudioDocument) {
  const zoom = canvas.getZoom() || 1;
  const snap = 8;
  const verticalTargets = [0, document.width / 2, document.width];
  const horizontalTargets = [0, document.height / 2, document.height];
  const objects = canvas.getObjects().filter((object) => object !== target && object.visible);
  for (const object of objects) {
    const width = object.getScaledWidth();
    const height = object.getScaledHeight();
    verticalTargets.push(object.left, object.left + width / 2, object.left + width);
    horizontalTargets.push(object.top, object.top + height / 2, object.top + height);
  }
  const width = target.getScaledWidth();
  const height = target.getScaledHeight();
  const xValues = [target.left, target.left + width / 2, target.left + width];
  const yValues = [target.top, target.top + height / 2, target.top + height];
  const nearest = (values: number[], lines: number[]) => {
    let best: { delta: number; line: number } | null = null;
    for (const value of values) for (const line of lines) {
      const delta = line - value;
      if (Math.abs(delta) * zoom <= snap && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, line };
    }
    return best;
  };
  const xSnap = nearest(xValues, verticalTargets);
  const ySnap = nearest(yValues, horizontalTargets);
  if (xSnap) target.set({ left: target.left + xSnap.delta });
  if (ySnap) target.set({ top: target.top + ySnap.delta });
  const nextXValues = [target.left, target.left + width / 2, target.left + width];
  const nextYValues = [target.top, target.top + height / 2, target.top + height];
  const vertical = verticalTargets.filter((line) => nextXValues.some((value) => Math.abs(value - line) * zoom <= snap));
  const horizontal = horizontalTargets.filter((line) => nextYValues.some((value) => Math.abs(value - line) * zoom <= snap));
  return { vertical: [...new Set(vertical)], horizontal: [...new Set(horizontal)] };
}

/** Guide positions, in percent of the document, for dragging the camera frame. */
export function cameraSnapTargets(canvas: Canvas | null, current: StudioDocument) {
  const targets = { vertical: [0, 50, 100], horizontal: [0, 50, 100] };
  for (const object of canvas?.getObjects() ?? []) {
    if (!object.visible) continue;
    const left = object.left / current.width * 100;
    const top = object.top / current.height * 100;
    const width = object.getScaledWidth() / current.width * 100;
    const height = object.getScaledHeight() / current.height * 100;
    targets.vertical.push(left, left + width / 2, left + width);
    targets.horizontal.push(top, top + height / 2, top + height);
  }
  return targets;
}
