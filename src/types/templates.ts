import type { StudioDocument } from "./studioDocument";
import type { OverlayMode } from "./state";

export type TemplateCategory = "scriptures" | "songs";

export type TemplateLayerType = "text" | "shape";
export type TemplateShapeKind = "rectangle" | "square" | "circle" | "triangle" | "line" | "arrow" | "polygon" | "star";
export type TemplateShapeFillMode = "solid" | "gradient" | "image";
export type TemplateShapeGradientStyle = "linear" | "radial" | "conic";
export type TemplateShapeStrokeDash = "solid" | "dashed" | "dotted";
export type TemplateShapeLineCap = "butt" | "round" | "square";
export type TemplateShapeLineJoin = "miter" | "round" | "bevel";
export type TemplateShapeImageFit = "cover" | "contain" | "tile";

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
export type TemplateTextScript = "superscript" | "subscript";

export interface TemplateTextShadow {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export interface TemplateTextLayer extends TemplateLayerBase {
  type: "text";
  content: string;
  color: string;
  outlineColor: string;
  outlineWidth: number;
  /** Border drawn around the textbox container, independent of glyph styling. */
  boxBorderColor?: string;
  boxBorderWidth?: number;
  fontFamily: string;
  fontStyle: "normal" | "italic";
  fontSize: number;
  fontWeight: number;
  align: "left" | "center" | "right";
  lineHeight: number;
  lineSpacing?: number;
  charSpacing?: number;
  backgroundColor?: string;
  cornerRadius?: number;
  lineBackgroundColor?: string;
  shadow?: TemplateTextShadow | null;
  scrollDuration?: number;
  scrollGap?: number;
  autoFit?: TemplateTextAutoFit;
  /** Character-level script formatting keyed by source-text character index. */
  scriptStyles?: Record<string, TemplateTextScript>;
  textBackgroundStyles?: Record<string, string>;
}

export interface TemplateShapeLayer extends TemplateLayerBase {
  type: "shape";
  shapeKind: TemplateShapeKind;
  fill: string;
  fillMode?: TemplateShapeFillMode;
  fillOpacity?: number;
  gradientStyle?: TemplateShapeGradientStyle;
  gradientStart?: string;
  gradientEnd?: string;
  gradientAngle?: number;
  fillImage?: string;
  fillImageType?: "image" | "video";
  fillImageFit?: TemplateShapeImageFit;
  fillImageOpacity?: number;
  /** Percentage scale of the media inside the shape. */
  fillImageScale?: number;
  /** Percentage offset from the centered media position. */
  fillImageX?: number;
  fillImageY?: number;
  borderColor: string;
  borderWidth: number;
  borderOpacity?: number;
  borderDash?: TemplateShapeStrokeDash;
  borderLineCap?: TemplateShapeLineCap;
  borderLineJoin?: TemplateShapeLineJoin;
  radius: number;
  shadow?: TemplateTextShadow | null;
  blendMode?: string;
  flipX?: boolean;
  flipY?: boolean;
  hueRotate?: number;
  invert?: number;
  blur?: number;
  grayscale?: number;
  sepia?: number;
  brightness?: number;
  contrast?: number;
  saturate?: number;
  polygonSides?: number;
  starPoints?: number;
  starInnerRadius?: number;
  arrowHeadSize?: number;
}

export type TemplateLayer = TemplateTextLayer | TemplateShapeLayer;

export type TemplateMediaFit = "cover" | "contain" | "fill";

export type TemplateCameraSourceType = "local" | "network";

export interface TemplateBackgroundMedia {
  type: "image" | "video" | "camera";
  src: string;
  /** Original file name for display. Video sources are prepared local files. */
  name?: string;
  poster?: string;
  fit: TemplateMediaFit;
  loop: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  blendMode?: string;
  muted?: boolean;
  speed?: number;
  flipX?: boolean;
  flipY?: boolean;
  cropTop?: number;
  cropRight?: number;
  cropBottom?: number;
  cropLeft?: number;
  hueRotate?: number;
  invert?: number;
  blur?: number;
  grayscale?: number;
  sepia?: number;
  brightness?: number;
  contrast?: number;
  saturate?: number;
  /** Live camera background (type "camera") — wired/USB webcam or a Wi-Fi phone camera (DroidCam/IP Webcam/iVCam) on the same network. */
  cameraSourceType?: TemplateCameraSourceType;
  /** Local: MediaDeviceInfo.deviceId. */
  cameraDeviceId?: string;
  /** Stable human-readable device label used by the native projector fallback. */
  cameraLabel?: string;
  /** Network: resolved MJPEG/HTTP stream URL, copied in at selection time. */
  cameraUrl?: string;
}

export interface TemplateScene {
  aspectRatio: "16:9";
  canvasWidth: number;
  canvasHeight: number;
  backgroundStart: string;
  backgroundEnd: string;
  gradientAngle?: number;
  gradientStyle?: "linear" | "radial" | "conic";
  backgroundOverlayOpacity: number;
  backgroundMedia: TemplateBackgroundMedia | null;
  layers: TemplateLayer[];
}

export interface TemplateCanvasTheme {
  id: string;
  category: TemplateCategory;
  layout: OverlayMode;
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
  /** Optional Fabric Studio source document for the canvas authoring editor. */
  studioDocument?: StudioDocument;
  createdAt: number;
  updatedAt: number;
}

export interface TemplateThemeDocument {
  version: 2;
  templates: TemplateCanvasTheme[];
  defaults: Record<TemplateCategory, Record<OverlayMode, string | null>>;
}
