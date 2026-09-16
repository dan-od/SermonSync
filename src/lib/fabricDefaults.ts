/**
 * Template Studio — Fabric.js global configuration.
 *
 * Per https://fabricjs.com/docs/configuring-defaults/ and
 * https://fabricjs.com/docs/using-custom-properties/: defaults are configured
 * once at the class level via `ownDefaults`, and app-specific object metadata
 * is registered through `customProperties` + TS declaration merging so it
 * round-trips through Fabric's own `toObject()`/`loadFromJSON()` instead of
 * a hand-rolled parallel schema.
 *
 * Per https://fabricjs.com/docs/configuring-controls/: the corner/border
 * knobs below (cornerSize, touchCornerSize, padding, hasBorders,
 * borderOpacityWhenMoving, ...) are the documented `ObjectProps`/`BorderProps`
 * that drive how selection controls look and behave.
 */
import { Canvas, Ellipse, FabricObject, FabricText, IText, Rect, Textbox, Triangle } from "fabric";
import type { CanvasOptions } from "fabric";

declare module "fabric" {
  interface FabricObject {
    /** Stable id correlating a Fabric object to its app-level layer/role. */
    studioId?: string;
    studioRole?: "layer" | "background";
    /** Operator-facing label shown in the Layers panel. */
    studioName?: string;
    /** Mirrors the Fabric interaction flags this object was locked with. */
    studioLocked?: boolean;
    /** App-level primitive kind preserved when multiple kinds share Fabric's Polygon class. */
    studioShapeKind?: "rectangle" | "square" | "circle" | "triangle" | "line" | "arrow" | "polygon" | "star";
    polygonSides?: number;
    starPoints?: number;
    starInnerRadius?: number;
    /** Vertical placement of textbox content inside its fixed-height box. */
    verticalAlign?: "top" | "center" | "bottom";
    /** User-defined textbox height, independent from the measured text height. */
    studioBoxHeight?: number;
    /** Whether the textbox automatically fits text while its box is resized. */
    autoSize?: "None" | "Grow to fit" | "Shrink to fit";
    lineBackgroundColor?: string;
    cornerRadius?: number;
    boxBorderColor?: string;
    boxBorderWidth?: number;
    lineSpacing?: number;
    scrollDuration?: number;
    scrollGap?: number;
    /** Script formatting applied to the whole textbox when no range is highlighted. */
    studioScript?: "none" | "superscript" | "subscript";
    /** Shape media-fill presentation settings. The image itself is stored in Fabric's Pattern fill. */
    studioShapeFillFit?: "cover" | "contain" | "tile";
    studioShapeFillScale?: number;
    studioShapeFillX?: number;
    studioShapeFillY?: number;
    studioShapeFillOpacity?: number;
    studioShapeFillColor?: string;
    studioShapeFillMediaType?: "image" | "video";
    studioShapeFillMediaSource?: string;
    /** True for objects created via "Add media", as opposed to a shape a user later filled with an image. */
    studioIsMediaAddon?: boolean;
  }
  interface SerializedObjectProps {
    studioId?: string;
    studioRole?: "layer" | "background";
    studioName?: string;
    studioLocked?: boolean;
    studioShapeKind?: "rectangle" | "square" | "circle" | "triangle" | "line" | "arrow" | "polygon" | "star";
    polygonSides?: number;
    starPoints?: number;
    starInnerRadius?: number;
    verticalAlign?: "top" | "center" | "bottom";
    studioBoxHeight?: number;
    autoSize?: "None" | "Grow to fit" | "Shrink to fit";
    lineBackgroundColor?: string;
    cornerRadius?: number;
    boxBorderColor?: string;
    boxBorderWidth?: number;
    lineSpacing?: number;
    scrollDuration?: number;
    scrollGap?: number;
    studioScript?: "none" | "superscript" | "subscript";
    studioShapeFillFit?: "cover" | "contain" | "tile";
    studioShapeFillScale?: number;
    studioShapeFillX?: number;
    studioShapeFillY?: number;
    studioShapeFillOpacity?: number;
    studioShapeFillColor?: string;
    studioShapeFillMediaType?: "image" | "video";
    studioShapeFillMediaSource?: string;
    studioIsMediaAddon?: boolean;
  }
}

/** Real font stack — a canvas 2D context cannot resolve CSS custom properties like var(--font-sans). */
export const STUDIO_DEFAULT_FONT = "Inter, system-ui, sans-serif";
export const STUDIO_ACCENT_COLOR = "#8c62ff";

let configured = false;

/** Idempotent: call once before constructing any Fabric canvas or object. */
export function configureFabricDefaults(): void {
  if (configured) return;
  configured = true;

  FabricObject.customProperties = ["studioId", "studioRole", "studioName", "studioLocked", "studioShapeKind", "polygonSides", "starPoints", "starInnerRadius", "verticalAlign", "studioBoxHeight", "autoSize", "studioScript", "lineBackgroundColor", "cornerRadius", "boxBorderColor", "boxBorderWidth", "lineSpacing", "scrollDuration", "scrollGap", "studioShapeFillFit", "studioShapeFillScale", "studioShapeFillX", "studioShapeFillY", "studioShapeFillOpacity", "studioShapeFillColor", "studioShapeFillMediaType", "studioShapeFillMediaSource", "studioIsMediaAddon"];
  // verticalAlign changes the pixels produced by Textbox#_renderTextCommon;
  // register it so Fabric invalidates the object cache when it changes.
  Textbox.cacheProperties = [...Textbox.cacheProperties, "verticalAlign", "cornerRadius"];

  // Fabric has horizontal text alignment, but no vertical textbox alignment.
  // Offset the normal text origin by the unused space in the textbox. This is
  // patched once on the shared prototype so it also applies to JSON-loaded
  // Textboxes, not only newly-created ones.
  const textboxPrototype = Textbox.prototype as Textbox & {
    _getTopOffset: () => number;
    _studioOriginalGetTopOffset?: () => number;
  };
  if (!textboxPrototype._studioOriginalGetTopOffset) {
    textboxPrototype._studioOriginalGetTopOffset = textboxPrototype._getTopOffset;
    textboxPrototype._getTopOffset = function () {
      const base = this._studioOriginalGetTopOffset!();
      const lines = (this as Textbox & { _textLines?: unknown[] })._textLines ?? [];
      const getHeight = (this as Textbox & { getHeightOfLine: (index: number) => number }).getHeightOfLine.bind(this);
      const textHeight = lines.reduce((height, _, index) => height + getHeight(index), 0);
      const freeSpace = Math.max(0, this.height - textHeight);
      const alignment = this.verticalAlign ?? "top";
      return base + (alignment === "center" ? freeSpace / 2 : alignment === "bottom" ? freeSpace : 0);
    };
  }

  const originalInitDimensions = textboxPrototype.initDimensions;
  if (!(textboxPrototype as Textbox & { _studioOriginalInitDimensions?: unknown })._studioOriginalInitDimensions) {
    (textboxPrototype as Textbox & { _studioOriginalInitDimensions?: () => void })._studioOriginalInitDimensions = originalInitDimensions;
    textboxPrototype.initDimensions = function () {
      const boxHeight = this.studioBoxHeight;
      (this as Textbox & { _studioOriginalInitDimensions: () => void })._studioOriginalInitDimensions();
      if (typeof boxHeight === "number" && Number.isFinite(boxHeight)) {
        // Keep the user-defined box independent from the measured text. Text
        // may wrap or overflow the box, but its font metrics are never scaled.
        this.height = Math.max(1, boxHeight);
      }
    };
  }

  const renderBackgroundPrototype = textboxPrototype as Textbox & {
    _renderBackground: (context: CanvasRenderingContext2D) => void;
    _studioOriginalRenderBackground?: (context: CanvasRenderingContext2D) => void;
  };
  if (!renderBackgroundPrototype._studioOriginalRenderBackground) {
    renderBackgroundPrototype._studioOriginalRenderBackground = renderBackgroundPrototype._renderBackground;
    renderBackgroundPrototype._renderBackground = function (context) {
      const radius = Math.max(0, Math.min(this.width, this.height) / 2, this.cornerRadius ?? 0);
      if (!this.backgroundColor || radius <= 0) {
        this._studioOriginalRenderBackground!(context);
        return;
      }
      const width = this.width;
      const height = this.height;
      context.save();
      context.fillStyle = this.backgroundColor;
      context.beginPath();
      context.roundRect(-width / 2, -height / 2, width, height, Math.min(radius, width / 2, height / 2));
      context.fill();
      context.restore();
    };
  }

  const renderPrototype = textboxPrototype as Textbox & {
    _render: (context: CanvasRenderingContext2D) => void;
    _studioOriginalRender?: (context: CanvasRenderingContext2D) => void;
  };
  if (!renderPrototype._studioOriginalRender) {
    renderPrototype._studioOriginalRender = renderPrototype._render;
    renderPrototype._render = function (context) {
      this._studioOriginalRender!(context);
      const width = Math.max(0, this.boxBorderWidth ?? 0);
      if (!this.boxBorderColor || width <= 0) return;
      const inset = width / 2;
      const radius = Math.min(Math.max(0, this.cornerRadius ?? 0), this.width / 2, this.height / 2);
      context.save();
      context.strokeStyle = this.boxBorderColor;
      context.lineWidth = width;
      context.beginPath();
      context.roundRect(-this.width / 2 + inset, -this.height / 2 + inset, this.width - width, this.height - width, Math.max(0, radius - inset));
      context.stroke();
      context.restore();
    };
  }

  Object.assign(FabricObject.ownDefaults, {
    cornerColor: STUDIO_ACCENT_COLOR,
    cornerStrokeColor: "#ffffff",
    borderColor: STUDIO_ACCENT_COLOR,
    cornerStyle: "circle",
    cornerSize: 10,
    touchCornerSize: 24,
    transparentCorners: false,
    hasBorders: true,
    borderOpacityWhenMoving: 0.6,
    borderScaleFactor: 1.5,
    padding: 4,
    lockScalingFlip: true,
    originX: "left",
    originY: "top",
  });

  Object.assign(FabricText.ownDefaults, { fontFamily: STUDIO_DEFAULT_FONT });
  Object.assign(IText.ownDefaults, { fontFamily: STUDIO_DEFAULT_FONT });
  Object.assign(Textbox.ownDefaults, {
    fontFamily: STUDIO_DEFAULT_FONT,
    fontSize: 28,
    fontWeight: 700,
    fill: "#f4f7ff",
    editable: true,
    splitByGrapheme: false,
    autoSize: "None",
  });

  Object.assign(Rect.ownDefaults, { strokeUniform: true });
  Object.assign(Ellipse.ownDefaults, { strokeUniform: true });
  Object.assign(Triangle.ownDefaults, { strokeUniform: true });
}

/** Interactive-canvas options shared by every Template Studio surface. */
export const STUDIO_CANVAS_OPTIONS: Partial<CanvasOptions> = {
  preserveObjectStacking: true,
  selection: true,
  selectionColor: "rgba(140, 98, 255, 0.15)",
  selectionBorderColor: STUDIO_ACCENT_COLOR,
  selectionLineWidth: 1,
  fireRightClick: false,
  stopContextMenu: true,
  enableRetinaScaling: true,
};

export function createStudioCanvas(element: HTMLCanvasElement): Canvas {
  configureFabricDefaults();
  return new Canvas(element, STUDIO_CANVAS_OPTIONS);
}
