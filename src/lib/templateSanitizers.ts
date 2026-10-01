import type {
  TemplateBackgroundMedia,
  TemplateCategory,
  TemplateCanvasTheme,
  TemplateLayer,
  TemplateMediaFit,
  TemplateScene,
  TemplateThemeDocument,
} from "../types/templates";
import type { OverlayMode } from "../types/state";
import type { StudioDocument } from "../types/studioDocument";

import {
  createDefaultScene,
  DEFAULT_CANVAS_HEIGHT,
  DEFAULT_CANVAS_WIDTH,
  emptyDefaults,
  LEGACY_DEFAULT_TEMPLATE_IDS,
  MAX_MEDIA_SOURCE_LENGTH,
} from "./templateDefaults";

function isHexColor(value: string) {
  return /^#([A-Fa-f0-9]{6})$/.test(value);
}

function coerceNumber(value: unknown, fallback: number, min?: number, max?: number) {
  const raw = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const lo = min ?? raw;
  const hi = max ?? raw;
  return Math.max(lo, Math.min(hi, raw));
}

function ensureScene(theme: TemplateCanvasTheme): TemplateScene {
  const fallback = createDefaultScene(theme.backgroundStart, theme.backgroundEnd);
  const input = (theme as Partial<TemplateCanvasTheme>).scene;
  if (!input) {
    return fallback;
  }

  const layers: TemplateLayer[] = Array.isArray(input.layers)
    ? input.layers
      .map((layer, index) => {
        const base = {
          id: typeof layer.id === "string" ? layer.id : `layer-${index + 1}`,
          name: typeof layer.name === "string" ? layer.name : `Layer ${index + 1}`,
          visible: layer.visible !== false,
          locked: layer.locked === true,
          x: coerceNumber(layer.x, 20, 0, 95),
          y: coerceNumber(layer.y, 20, 0, 95),
          width: coerceNumber(layer.width, 60, 5, 100),
          height: coerceNumber(layer.height, 20, 5, 100),
          rotation: coerceNumber(layer.rotation, 0, -180, 180),
          zIndex: coerceNumber(layer.zIndex, index + 1, 0, 500),
          opacity: coerceNumber(layer.opacity, 1, 0.1, 1),
        };

        if (layer.type === "shape") {
          const shapeKind =
            layer.shapeKind === "circle" ||
            layer.shapeKind === "square" ||
            layer.shapeKind === "triangle" ||
            layer.shapeKind === "rectangle" ||
            layer.shapeKind === "line" ||
            layer.shapeKind === "arrow" ||
            layer.shapeKind === "polygon" ||
            layer.shapeKind === "star"
              ? layer.shapeKind
              : "rectangle";
          return {
            ...base,
            type: "shape" as const,
            shapeKind,
            fill: typeof layer.fill === "string" && !layer.fill
              ? ""
              : isHexColor(layer.fill)
                ? layer.fill
                : "#0f1117",
            borderColor: typeof layer.borderColor === "string" && !layer.borderColor
              ? ""
              : isHexColor(layer.borderColor)
                ? layer.borderColor
                : theme.accent,
            borderWidth: coerceNumber(layer.borderWidth, 1, 0, 12),
            radius: coerceNumber(layer.radius, 8, 0, 60),
            fillOpacity: coerceNumber(layer.fillOpacity, 1, 0, 1),
            fillMode: layer.fillMode === "image" || layer.fillMode === "gradient" ? layer.fillMode : "solid",
            fillImage: typeof layer.fillImage === "string" && layer.fillImage.length <= MAX_MEDIA_SOURCE_LENGTH ? layer.fillImage : undefined,
            fillImageType: layer.fillImageType === "video" ? "video" : "image",
            fillImageFit: layer.fillImageFit === "contain" || layer.fillImageFit === "tile" ? layer.fillImageFit : "cover",
            fillImageOpacity: coerceNumber(layer.fillImageOpacity, 1, 0, 1),
            fillImageScale: coerceNumber(layer.fillImageScale, 100, 10, 400),
            fillImageX: coerceNumber(layer.fillImageX, 0, -200, 200),
            fillImageY: coerceNumber(layer.fillImageY, 0, -200, 200),
            borderDash: layer.borderDash === "dashed" || layer.borderDash === "dotted" ? layer.borderDash : "solid",
            borderLineCap: layer.borderLineCap === "butt" || layer.borderLineCap === "square" ? layer.borderLineCap : "round",
            borderLineJoin: layer.borderLineJoin === "miter" || layer.borderLineJoin === "bevel" ? layer.borderLineJoin : "round",
            blendMode: typeof layer.blendMode === "string" && ["source-over", "multiply", "screen", "overlay", "darken", "lighten"].includes(layer.blendMode) ? layer.blendMode : "source-over",
            flipX: layer.flipX === true,
            flipY: layer.flipY === true,
            polygonSides: coerceNumber(layer.polygonSides, 6, 3, 12),
            starPoints: coerceNumber(layer.starPoints, 5, 3, 10),
            starInnerRadius: coerceNumber(layer.starInnerRadius, 22, 4, 46),
            arrowHeadSize: coerceNumber(layer.arrowHeadSize, 28, 8, 48),
            hueRotate: coerceNumber(layer.hueRotate, 0, -360, 360),
            invert: coerceNumber(layer.invert, 0, 0, 100),
            blur: coerceNumber(layer.blur, 0, 0, 100),
            grayscale: coerceNumber(layer.grayscale, 0, 0, 100),
            sepia: coerceNumber(layer.sepia, 0, 0, 100),
            brightness: coerceNumber(layer.brightness, 100, 0, 400),
            contrast: coerceNumber(layer.contrast, 100, 0, 400),
            saturate: coerceNumber(layer.saturate, 100, 0, 400),
            shadow: layer.shadow && typeof layer.shadow === "object" ? {
              color: isHexColor(layer.shadow.color) ? layer.shadow.color : "#000000",
              blur: coerceNumber(layer.shadow.blur, 0, 0, 100),
              offsetX: coerceNumber(layer.shadow.offsetX, 0, -500, 500),
              offsetY: coerceNumber(layer.shadow.offsetY, 0, -500, 500),
            } : null,
          };
        }

        return {
          ...base,
          type: "text" as const,
          content: typeof layer.content === "string" ? layer.content : "{scripture_text}",
          color: typeof layer.color === "string" && !layer.color
            ? ""
            : isHexColor(layer.color)
              ? layer.color
              : "#f4f7ff",
          outlineColor: typeof layer.outlineColor === "string" && !layer.outlineColor
            ? ""
            : isHexColor(layer.outlineColor)
              ? layer.outlineColor
              : "",
          outlineWidth: coerceNumber(layer.outlineWidth, 0, 0, 12),
          boxBorderColor: typeof layer.boxBorderColor === "string" && !layer.boxBorderColor
            ? ""
            : isHexColor(typeof layer.boxBorderColor === "string" ? layer.boxBorderColor : "")
              ? layer.boxBorderColor
              : "",
          boxBorderWidth: coerceNumber(layer.boxBorderWidth, 0, 0, 60),
          backgroundColor: typeof layer.backgroundColor === "string" && !layer.backgroundColor
            ? ""
            : isHexColor(typeof layer.backgroundColor === "string" ? layer.backgroundColor : "")
              ? layer.backgroundColor
              : "",
          cornerRadius: coerceNumber(layer.cornerRadius, 0, 0, 960),
          lineBackgroundColor: typeof layer.lineBackgroundColor === "string" && !layer.lineBackgroundColor
            ? ""
            : isHexColor(typeof layer.lineBackgroundColor === "string" ? layer.lineBackgroundColor : "")
              ? layer.lineBackgroundColor
              : "",
          charSpacing: coerceNumber(layer.charSpacing, 0, -500, 2000),
          lineSpacing: coerceNumber(layer.lineSpacing, 0, -200, 500),
          scrollDuration: coerceNumber(layer.scrollDuration, 0, 0, 3600),
          scrollGap: coerceNumber(layer.scrollGap, 100, 0, 5000),
          shadow: layer.shadow && typeof layer.shadow === "object" ? {
            color: isHexColor(typeof (layer.shadow as unknown as Record<string, unknown>).color === "string" ? (layer.shadow as unknown as Record<string, unknown>).color as string : "") ? (layer.shadow as unknown as Record<string, unknown>).color as string : "#000000",
            blur: coerceNumber((layer.shadow as unknown as Record<string, unknown>).blur, 0, 0, 100),
            offsetX: coerceNumber((layer.shadow as unknown as Record<string, unknown>).offsetX, 0, -500, 500),
            offsetY: coerceNumber((layer.shadow as unknown as Record<string, unknown>).offsetY, 0, -500, 500),
          } : null,
          fontFamily: typeof layer.fontFamily === "string" && layer.fontFamily.trim() ? layer.fontFamily : "var(--font-sans)",
          fontStyle: layer.fontStyle === "italic" ? "italic" : "normal",
          fontSize: coerceNumber(layer.fontSize, 30, 10, 140),
          fontWeight: coerceNumber(layer.fontWeight, 700, 300, 900),
          align: layer.align === "left" || layer.align === "right" ? layer.align : "center",
          lineHeight: coerceNumber(layer.lineHeight, 1.2, 0.8, 2),
          autoFit: layer.autoFit === "shrink" || layer.autoFit === "grow" ? layer.autoFit : "none",
        };
      })
    : fallback.layers;

  return {
    aspectRatio: "16:9",
    canvasWidth: coerceNumber(input.canvasWidth, DEFAULT_CANVAS_WIDTH, 320, 7680),
    canvasHeight: coerceNumber(input.canvasHeight, DEFAULT_CANVAS_HEIGHT, 180, 4320),
    backgroundStart: isHexColor(input.backgroundStart) ? input.backgroundStart : fallback.backgroundStart,
    backgroundEnd: isHexColor(input.backgroundEnd) ? input.backgroundEnd : fallback.backgroundEnd,
    backgroundOverlayOpacity: coerceNumber(input.backgroundOverlayOpacity, 0.35, 0, 1),
    backgroundMedia: sanitizeBackgroundMedia(input.backgroundMedia),
    layers: layers.length > 0 ? layers : fallback.layers,
  };
}

function sanitizeBackgroundMedia(input: unknown): TemplateBackgroundMedia | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const media = input as Partial<TemplateBackgroundMedia>;
  if (media.type !== "image" && media.type !== "video") {
    return null;
  }
  if (typeof media.src !== "string" || !media.src || media.src.length > MAX_MEDIA_SOURCE_LENGTH) {
    return null;
  }
  const fit: TemplateMediaFit = media.fit === "contain" || media.fit === "fill" ? media.fit : "cover";
  return {
    type: media.type,
    src: media.src,
    name: typeof media.name === "string" && media.name.trim() ? media.name.trim().slice(0, 255) : undefined,
    fit,
    loop: media.loop !== false,
    x: coerceNumber(media.x, 0, 0, 95),
    y: coerceNumber(media.y, 0, 0, 95),
    width: coerceNumber(media.width, 100, 5, 100),
    height: coerceNumber(media.height, 100, 5, 100),
    opacity: coerceNumber(media.opacity, 1, 0.1, 1),
    blendMode: typeof media.blendMode === "string" && media.blendMode ? media.blendMode : "normal",
    muted: media.muted !== false,
    speed: coerceNumber(media.speed, 1, 0.1, 4),
    flipX: media.flipX === true,
    flipY: media.flipY === true,
    cropTop: coerceNumber(media.cropTop, 0, 0, 95),
    cropRight: coerceNumber(media.cropRight, 0, 0, 95),
    cropBottom: coerceNumber(media.cropBottom, 0, 0, 95),
    cropLeft: coerceNumber(media.cropLeft, 0, 0, 95),
    hueRotate: coerceNumber(media.hueRotate, 0, -360, 360),
    invert: coerceNumber(media.invert, 0, 0, 100),
    blur: coerceNumber(media.blur, 0, 0, 100),
    grayscale: coerceNumber(media.grayscale, 0, 0, 100),
    sepia: coerceNumber(media.sepia, 0, 0, 100),
    brightness: coerceNumber(media.brightness, 100, 0, 400),
    contrast: coerceNumber(media.contrast, 100, 0, 400),
    saturate: coerceNumber(media.saturate, 100, 0, 400),
  };
}

function sanitizeStudioDocument(input: unknown, category: TemplateCategory, name: string): StudioDocument | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Partial<StudioDocument>;
  if (!Array.isArray(value.objects)) return undefined;
  const width = coerceNumber(value.width, DEFAULT_CANVAS_WIDTH, 320, 7680);
  const height = coerceNumber(value.height, DEFAULT_CANVAS_HEIGHT, 180, 4320);
  return {
    id: typeof value.id === "string" && value.id ? value.id : `studio-${Date.now()}`,
    name: typeof value.name === "string" && value.name.trim() ? value.name.trim().slice(0, 80) : name,
    category,
    width,
    height,
    background: typeof value.background === "string" && value.background ? value.background : "#0f1117",
    backgroundMode: value.backgroundMode === "gradient" || value.backgroundMode === "media" ? value.backgroundMode : "color",
    backgroundColor: typeof value.backgroundColor === "string" ? value.backgroundColor : value.background,
    backgroundGradientStart: typeof value.backgroundGradientStart === "string" ? value.backgroundGradientStart : "#0f1117",
    backgroundGradientEnd: typeof value.backgroundGradientEnd === "string" ? value.backgroundGradientEnd : "#25204a",
    backgroundGradientAngle: typeof value.backgroundGradientAngle === "number" && Number.isFinite(value.backgroundGradientAngle) ? value.backgroundGradientAngle : 135,
    backgroundGradientStyle: value.backgroundGradientStyle === "radial" || value.backgroundGradientStyle === "conic" ? value.backgroundGradientStyle : "linear",
    backgroundBlur: coerceNumber(value.backgroundBlur, 0, 0, 100),
    backgroundMedia: sanitizeBackgroundMedia(value.backgroundMedia),
    fabricVersion: typeof value.fabricVersion === "string" && value.fabricVersion ? value.fabricVersion : "7.0.0",
    objects: value.objects.filter((object): object is Record<string, unknown> => Boolean(object) && typeof object === "object"),
    createdAt: typeof value.createdAt === "number" && Number.isFinite(value.createdAt) ? value.createdAt : Date.now(),
    updatedAt: typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt) ? value.updatedAt : Date.now(),
  };
}

function sanitizeTheme(theme: TemplateCanvasTheme): TemplateCanvasTheme {
  const nextScale = Number.isFinite(theme.fontScale) ? theme.fontScale : 1;
  const category = theme.category === "songs" ? "songs" : "scriptures";
  const layout: OverlayMode = theme.layout === "lower-third" ? "lower-third" : "widescreen";
  const accent = isHexColor(theme.accent) ? theme.accent : "#8c62ff";
  const backgroundStart = isHexColor(theme.backgroundStart) ? theme.backgroundStart : "#493072";
  const backgroundEnd = isHexColor(theme.backgroundEnd) ? theme.backgroundEnd : "#090a13";
  const textAlign = theme.textAlign === "center" || theme.textAlign === "right" ? theme.textAlign : "left";

  const draft = {
    ...theme,
    category,
    layout,
    accent,
    backgroundStart,
    backgroundEnd,
    textAlign,
  } as TemplateCanvasTheme;

  return {
    ...draft,
    name: theme.name.trim().slice(0, 80) || "Untitled Theme",
    subtitle: theme.subtitle.trim().slice(0, 180),
    accent,
    backgroundStart,
    backgroundEnd,
    label: theme.label.trim().slice(0, 32) || "THEME",
    lines: [
      (theme.lines[0] ?? "").trim().slice(0, 64),
      (theme.lines[1] ?? "").trim().slice(0, 64),
      (theme.lines[2] ?? "").trim().slice(0, 64),
    ],
    textAlign,
    fontScale: Math.max(0.75, Math.min(1.6, nextScale)),
    showLabelBadge: theme.showLabelBadge !== false,
    scene: ensureScene(draft),
    studioDocument: sanitizeStudioDocument(theme.studioDocument, category, theme.name),
    createdAt: Number.isFinite(theme.createdAt) ? theme.createdAt : Date.now(),
    updatedAt: Number.isFinite(theme.updatedAt) ? theme.updatedAt : Date.now(),
  };
}

export function sanitizeDocument(value: TemplateThemeDocument): TemplateThemeDocument {
  const templateMap = new Map<string, TemplateCanvasTheme>();
  value.templates.forEach((entry) => {
    templateMap.set(entry.id, sanitizeTheme(entry));
  });

  const templates = Array.from(templateMap.values()).filter((entry) => !LEGACY_DEFAULT_TEMPLATE_IDS.has(entry.id));
  const legacyDefaults = value.defaults as unknown as Record<TemplateCategory, string | null>;
  const defaults = emptyDefaults();
  (["scriptures", "songs"] as TemplateCategory[]).forEach((category) => {
    const saved = value.defaults[category];
    const savedByLayout = saved && typeof saved === "object" ? saved as Record<OverlayMode, string | null> : null;
    (["widescreen", "lower-third"] as OverlayMode[]).forEach((layout) => {
      const templateId = savedByLayout?.[layout] ?? (layout === "widescreen" ? legacyDefaults[category] : null);
      defaults[category][layout] = typeof templateId === "string" && templates.some((entry) => entry.id === templateId && entry.category === category && entry.layout === layout)
        ? templateId
        : null;
    });
  });

  return {
    version: 2,
    templates,
    defaults,
  };
}
