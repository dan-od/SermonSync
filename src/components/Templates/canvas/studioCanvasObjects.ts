/** Fabric object helpers: snapshots, ids, lookup, shape builders and textbox controls. */
import { Canvas, Control, Ellipse, FabricObject, Line, Polygon, Rect, Textbox, Triangle, controlsUtils } from "fabric";

import { STUDIO_ACCENT_COLOR } from "../../../lib/fabricDefaults";
import type { StudioFabricObjectData } from "../../../types/studioDocument";
import type { StudioCanvasSnapshot, StudioShapeKind } from "./studioCanvasTypes";

export function canvasSnapshot(canvas: Canvas): StudioCanvasSnapshot {
  const exported = canvas.toObject();
  return {
    objects: exported.objects as StudioFabricObjectData[],
    background: typeof exported.background === "string" ? exported.background : "",
  };
}

export function snapshotsEqual(left: StudioCanvasSnapshot, right: StudioCanvasSnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
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

export type ShapeFillFit = "cover" | "contain" | "tile";

export function isShapeObject(object: FabricObject): boolean {
  return ["rectangle", "square", "circle", "triangle", "line", "arrow", "polygon", "star"].includes(String(object.studioShapeKind))
    || ["rect", "ellipse", "triangle", "line", "polygon"].includes(String(object.type).toLowerCase());
}

export function radialPoints(pointCount: number, outerRadius: number, innerRadius = outerRadius, rotation = -Math.PI / 2) {
  return Array.from({ length: pointCount }, (_, index) => {
    const angle = rotation + index * Math.PI * 2 / pointCount;
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    return { x: outerRadius + Math.cos(angle) * radius, y: outerRadius + Math.sin(angle) * radius };
  });
}

export function shapeFactory(kind: StudioShapeKind, width: number, height: number): FabricObject {
  const common = { width, height, fill: "#101319", stroke: STUDIO_ACCENT_COLOR, strokeWidth: 1 };
  const shape = kind === "circle"
    ? new Ellipse({ ...common, rx: width / 2, ry: height / 2 })
    : kind === "triangle"
      ? new Triangle(common)
      : kind === "line"
        ? new Line([0, 0, width, height], { ...common, fill: "", strokeLineCap: "round" })
        : kind === "arrow"
          ? new Polygon([{ x: 0, y: height * 0.35 }, { x: width * 0.72, y: height * 0.35 }, { x: width * 0.72, y: 0 }, { x: width, y: height / 2 }, { x: width * 0.72, y: height }, { x: width * 0.72, y: height * 0.65 }, { x: 0, y: height * 0.65 }], common)
          : kind === "polygon"
            ? new Polygon(radialPoints(6, Math.min(width, height) / 2), common)
            : kind === "star"
              ? new Polygon(radialPoints(10, Math.min(width, height) / 2, Math.min(width, height) * 0.22), common)
              : new Rect({ ...common, rx: 8, ry: 8 });
  shape.studioShapeKind = kind;
  if (kind === "polygon") shape.polygonSides = 6;
  if (kind === "star") {
    shape.starPoints = 5;
    shape.starInnerRadius = 0.44;
  }
  return shape;
}

function createStudioTextboxControls() {
  const controls = Textbox.createControls().controls;
  // Fabric's regular corner controls change scaleX/scaleY, which scales the
  // glyphs. Textboxes use dimension controls instead: width changes wrapping,
  // height changes the box, and the text keeps its original font metrics.
  delete controls.tl;
  delete controls.tr;
  delete controls.bl;
  delete controls.br;
  controls.mt = new Control({ x: 0, y: -0.5, actionHandler: controlsUtils.changeHeight });
  controls.mb = new Control({ x: 0, y: 0.5, actionHandler: controlsUtils.changeHeight });
  return controls;
}

export function configureStudioTextbox(textbox: Textbox, boxHeight?: number): void {
  textbox.controls = createStudioTextboxControls();
  const width = textbox.width * textbox.scaleX;
  const height = (boxHeight ?? textbox.height) * textbox.scaleY;
  // Normalize any legacy/scaled textbox to dimensions. This preserves the
  // visible box size while ensuring future resizing cannot distort the text.
  textbox.set({ width, scaleX: 1, scaleY: 1 });
  textbox.set({ lockScalingX: true, lockScalingY: true });
  if (Number.isFinite(height)) {
    textbox.studioBoxHeight = Math.max(1, height);
    textbox.initDimensions();
  }
}
