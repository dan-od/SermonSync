import { Ellipse, FabricObject, Line, Polygon, Rect, Triangle } from "fabric";
import { STUDIO_ACCENT_COLOR } from "../../../lib/fabricDefaults";
import { type StudioShapeKind } from "./types";

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
