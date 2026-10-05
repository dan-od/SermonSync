export type OverlayKind = "timer" | "alert" | "name" | "watermark" | "custom";
export type OverlayShapeKind = "rectangle" | "ellipse" | "triangle";

export interface OverlayShape {
  id: string;
  name: string;
  kind: OverlayShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  radius: number;
  rotation: number;
  layer: "behind" | "front";
}

export interface OverlayWidget {
  id: string;
  name: string;
  type: "timer" | "alert" | "name";
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  speakerTitle?: string;
  titleFontSize?: number;
  titleColor?: string;
  titleFontWeight?: number;
  durationSeconds: number;
  fontSize: number;
  fontWeight: number;
  textAlign: "left" | "center" | "right";
  color: string;
  showPanel: boolean;
  panelColor: string;
  showAccent: boolean;
  accentColor: string;
  opacity: number;
  rotation: number;
}

export interface OverlayWatermark {
  id: string;
  name: string;
  type: "watermark";
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
  fit: "contain" | "cover" | "fill";
  opacity: number;
  rotation: number;
}

export type OverlayElement = (OverlayWidget | OverlayWatermark | (OverlayShape & { type: "shape" })) & { visible?: boolean };

export interface OverlayDefinition {
  id: string;
  name: string;
  kind: OverlayKind;
  x: number;
  y: number;
  width: number;
  /** Height in canvas percent. Older saved overlays use the type default. */
  height?: number;
  shapes?: OverlayShape[];
  /** Composable canvas elements. Absence means a legacy single-widget overlay. */
  elements?: OverlayElement[];
  message: string;
  durationSeconds: number;
  backgroundColor: string;
  foregroundColor: string;
  accentColor: string;
  createdAt: number;
  updatedAt: number;
}

export interface ActiveOverlay {
  definition: OverlayDefinition;
  startedAt: number;
}

export function createOverlayDraft(kind: OverlayKind = "custom"): OverlayDefinition {
  const now = Date.now();
  return {
    id: `overlay-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name: kind === "timer" ? "New Timer" : kind === "alert" ? "New Quick Alert" : kind === "name" ? "New Name" : kind === "watermark" ? "New Watermark" : "New Overlay",
    kind,
    x: kind === "timer" ? 77 : 27,
    y: kind === "timer" ? 6 : 77,
    width: kind === "timer" ? 18 : 46,
    height: kind === "timer" ? 15 : 20,
    shapes: [],
    elements: kind === "custom" ? [] : kind === "watermark" ? [createOverlayWatermark()] : [createOverlayWidget(kind)],
    message: "Service begins soon",
    durationSeconds: 300,
    backgroundColor: "#15151e",
    foregroundColor: "#ffffff",
    accentColor: "#913eff",
    createdAt: now,
    updatedAt: now,
  };
}

export function createOverlayWidget(type: OverlayWidget["type"], existingCount = 0): OverlayWidget {
  return {
    id: `widget-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: `${type === "timer" ? "Timer" : type === "alert" ? "Quick Alert" : "Name"} ${existingCount + 1}`,
    type,
    x: type === "timer" ? 34 : 25,
    y: type === "timer" ? 40 : 74,
    width: type === "timer" ? 32 : 50,
    height: type === "timer" ? 16 : 17,
    text: type === "timer" ? "{time}" : type === "name" ? "Speaker Name" : "Quick alert",
    speakerTitle: type === "name" ? "Speaker Title" : undefined,
    titleFontSize: type === "name" ? 32 : undefined,
    titleColor: type === "name" ? "#ffffff" : undefined,
    titleFontWeight: type === "name" ? 500 : undefined,
    durationSeconds: 300,
    fontSize: type === "timer" ? 88 : 58,
    fontWeight: 700,
    textAlign: type === "timer" ? "center" : "left",
    color: "#ffffff",
    showPanel: false,
    panelColor: "#15151e",
    showAccent: false,
    accentColor: "#913eff",
    opacity: 1,
    rotation: 0,
  };
}

export function createOverlayWatermark(existingCount = 0): OverlayWatermark {
  return {
    id: `watermark-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: `Watermark ${existingCount + 1}`,
    type: "watermark",
    x: 84, y: 5, width: 12, height: 18,
    src: "", fit: "contain", opacity: 1, rotation: 0,
  };
}

export function createOverlayShapeElement(kind: OverlayShapeKind, existingCount = 0): OverlayElement {
  return { ...createOverlayShape(kind, existingCount), type: "shape" };
}

export function getOverlayElements(overlay: OverlayDefinition): OverlayElement[] {
  if (Array.isArray(overlay.elements)) return overlay.elements;
  const legacyShapes = (overlay.shapes ?? []).map((shape) => ({ ...shape, type: "shape" as const }));
  if (overlay.kind !== "timer" && overlay.kind !== "alert") return legacyShapes;
  const legacyWidget: OverlayWidget = {
    ...createOverlayWidget(overlay.kind),
    id: `widget-${overlay.id}`,
    name: overlay.kind === "timer" ? "Timer" : "Quick Alert",
    x: overlay.x,
    y: overlay.y,
    width: overlay.width,
    height: overlayHeight(overlay),
    text: overlay.kind === "timer" ? "{time}" : overlay.message,
    durationSeconds: overlay.durationSeconds,
    color: overlay.foregroundColor,
    showPanel: true,
    panelColor: overlay.backgroundColor,
    showAccent: true,
    accentColor: overlay.accentColor,
  };
  return [
    ...legacyShapes.filter((shape) => shape.layer === "behind"),
    legacyWidget,
    ...legacyShapes.filter((shape) => shape.layer === "front"),
  ];
}

export function overlayKindFromElements(elements: OverlayElement[]): OverlayKind {
  const functions = new Set(elements.filter((element) => element.type !== "shape").map((element) => element.type));
  return functions.size === 1 ? [...functions][0] : "custom";
}

export function overlayHeight(overlay: OverlayDefinition): number {
  return overlay.height ?? (overlay.kind === "timer" ? 15 : 20);
}

export function createOverlayShape(kind: OverlayShapeKind, existingCount = 0): OverlayShape {
  return {
    id: `shape-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: `${kind[0].toUpperCase()}${kind.slice(1)} ${existingCount + 1}`,
    kind,
    x: 37,
    y: 39,
    width: 26,
    height: 20,
    fill: "#7b2ff7",
    stroke: "#ffffff",
    strokeWidth: 0,
    opacity: 0.9,
    radius: 24,
    rotation: 0,
    layer: "behind",
  };
}
