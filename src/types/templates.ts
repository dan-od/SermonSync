export type TemplateCategory = "scriptures" | "songs";

export type TemplateLayerType = "text" | "shape";
export type TemplateShapeKind = "rectangle" | "square" | "circle" | "triangle";

export interface TemplateLayerBase {
  id: string;
  name: string;
  type: TemplateLayerType;
  visible: boolean;
  locked: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  opacity: number;
}

export type TemplateTextAutoFit = "none" | "shrink" | "grow";

export interface TemplateTextLayer extends TemplateLayerBase {
  type: "text";
  content: string;
  color: string;
  outlineColor: string;
  outlineWidth: number;
  fontFamily: string;
  fontStyle: "normal" | "italic";
  fontSize: number;
  fontWeight: number;
  align: "left" | "center" | "right";
  lineHeight: number;
  autoFit?: TemplateTextAutoFit;
}

export interface TemplateShapeLayer extends TemplateLayerBase {
  type: "shape";
  shapeKind: TemplateShapeKind;
  fill: string;
  borderColor: string;
  borderWidth: number;
  radius: number;
}

export type TemplateLayer = TemplateTextLayer | TemplateShapeLayer;

export type TemplateMediaFit = "cover" | "contain" | "fill";

export interface TemplateBackgroundMedia {
  type: "image" | "video";
  src: string;
  fit: TemplateMediaFit;
  loop: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
}

export interface TemplateScene {
  aspectRatio: "16:9";
  canvasWidth: number;
  canvasHeight: number;
  backgroundStart: string;
  backgroundEnd: string;
  backgroundOverlayOpacity: number;
  backgroundMedia: TemplateBackgroundMedia | null;
  layers: TemplateLayer[];
}

export interface TemplateCanvasTheme {
  id: string;
  category: TemplateCategory;
  name: string;
  subtitle: string;
  accent: string;
  backgroundStart: string;
  backgroundEnd: string;
  label: string;
  lines: [string, string, string];
  textAlign: "left" | "center" | "right";
  fontScale: number;
  showLabelBadge: boolean;
  scene: TemplateScene;
  createdAt: number;
  updatedAt: number;
}

export interface TemplateThemeDocument {
  version: 1;
  templates: TemplateCanvasTheme[];
  defaults: Record<TemplateCategory, string | null>;
}
