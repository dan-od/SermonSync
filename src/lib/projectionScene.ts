import type { TemplateCanvasTheme, TemplateScene, TemplateTextScript } from "../types/templates";
import type { StudioFabricObjectData } from "../types/studioDocument";

function scriptStylesFromStudioObject(object: StudioFabricObjectData): Record<string, TemplateTextScript> {
  const serializedStyles = object.styles;
  const text = typeof object.text === "string" ? object.text : "";
  if (!serializedStyles || typeof serializedStyles !== "object" || !text) return {};
  if (Array.isArray(serializedStyles)) {
    const scriptStyles: Record<string, TemplateTextScript> = {};
    serializedStyles.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const range = entry as Record<string, unknown>;
      const start = typeof range.start === "number" ? Math.max(0, Math.floor(range.start)) : -1;
      const end = typeof range.end === "number" ? Math.min(text.length, Math.floor(range.end)) : -1;
      const style = range.style;
      const script = style && typeof style === "object" ? (style as Record<string, unknown>).studioScript : undefined;
      if (start < 0 || end <= start || (script !== "superscript" && script !== "subscript")) return;
      for (let index = start; index < end; index += 1) scriptStyles[String(index)] = script;
    });
    return scriptStyles;
  }
  const lines = text.split("\n");
  const lineStarts: number[] = [];
  let offset = 0;
  lines.forEach((line) => {
    lineStarts.push(offset);
    offset += line.length + 1;
  });

  const scriptStyles: Record<string, TemplateTextScript> = {};
  Object.entries(serializedStyles as Record<string, unknown>).forEach(([lineKey, line]) => {
    const lineIndex = Number(lineKey);
    if (!Number.isInteger(lineIndex) || !line || typeof line !== "object") return;
    Object.entries(line as Record<string, unknown>).forEach(([charKey, style]) => {
      const charIndex = Number(charKey);
      if (!Number.isInteger(charIndex) || !style || typeof style !== "object") return;
      const script = (style as Record<string, unknown>).studioScript;
      if ((script === "superscript" || script === "subscript") && lineStarts[lineIndex] !== undefined) {
        scriptStyles[String(lineStarts[lineIndex] + charIndex)] = script;
      }
    });
  });
  return scriptStyles;
}

function textBackgroundStylesFromStudioObject(object: StudioFabricObjectData): Record<string, string> {
  const serializedStyles = object.styles;
  if (!serializedStyles || typeof serializedStyles !== "object") return {};
  const result: Record<string, string> = {};
  if (Array.isArray(serializedStyles)) {
    serializedStyles.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const range = entry as Record<string, unknown>;
      const style = range.style;
      const color = style && typeof style === "object" ? (style as Record<string, unknown>).textBackgroundColor : undefined;
      if (typeof color !== "string" || !color) return;
      const start = typeof range.start === "number" ? range.start : -1;
      const end = typeof range.end === "number" ? range.end : -1;
      for (let index = start; index < end; index += 1) result[String(index)] = color;
    });
    return result;
  }
  const text = typeof object.text === "string" ? object.text : "";
  const lineStarts: number[] = [];
  let offset = 0;
  text.split("\n").forEach((line) => {
    lineStarts.push(offset);
    offset += line.length + 1;
  });
  Object.entries(serializedStyles as Record<string, unknown>).forEach(([lineKey, line]) => {
    if (!line || typeof line !== "object") return;
    const lineStart = lineStarts[Number(lineKey)];
    if (lineStart === undefined) return;
    Object.entries(line as Record<string, unknown>).forEach(([charKey, style]) => {
      const color = style && typeof style === "object" ? (style as Record<string, unknown>).textBackgroundColor : undefined;
      if (typeof color === "string" && color) result[String(lineStart + Number(charKey))] = color;
    });
  });
  return text ? result : {};
}

function effectiveStudioFontSize(object: StudioFabricObjectData, fallback: number): number {
  const serializedStyles = object.styles;
  if (!serializedStyles || typeof serializedStyles !== "object") return fallback;
  if (Array.isArray(serializedStyles)) {
    const fontSizes = serializedStyles.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const style = (entry as Record<string, unknown>).style;
      const value = style && typeof style === "object" ? (style as Record<string, unknown>).fontSize : undefined;
      return typeof value === "number" && Number.isFinite(value) ? [value] : [];
    });
    if (fontSizes.length === 0) return fallback;
    const first = fontSizes[0];
    return fontSizes.every((size) => Math.abs(size - first) < 0.01) ? first : fallback;
  }
  const fontSizes = Object.values(serializedStyles as Record<string, unknown>).flatMap((line) => {
    if (!line || typeof line !== "object") return [];
    return Object.values(line as Record<string, unknown>).map((style) => {
      if (!style || typeof style !== "object") return null;
      const value = (style as Record<string, unknown>).fontSize;
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    });
  }).filter((value): value is number => value !== null);
  if (fontSizes.length === 0) return fallback;
  const first = fontSizes[0];
  return fontSizes.every((size) => Math.abs(size - first) < 0.01) ? first : fallback;
}

const projectionSceneCache = new WeakMap<TemplateCanvasTheme, TemplateScene>();

export function projectionScene(template: TemplateCanvasTheme): TemplateScene {
  const cached = projectionSceneCache.get(template);
  if (cached) {
    return cached;
  }

  const studioDocument = template.studioDocument;
  if (!studioDocument) {
    projectionSceneCache.set(template, template.scene);
    return template.scene;
  }
  const studioObjects = new Map(
    studioDocument.objects
      .filter((object) => typeof object.studioId === "string")
      .map((object) => [object.studioId as string, object]),
  );

  const scene: TemplateScene = {
    ...template.scene,
    canvasWidth: studioDocument.width,
    canvasHeight: studioDocument.height,
    backgroundStart: studioDocument.backgroundMode === "gradient"
      ? studioDocument.backgroundGradientStart || studioDocument.background
      : studioDocument.backgroundMode === "media"
        ? "#0f1117"
        : studioDocument.backgroundColor ?? studioDocument.background,
    backgroundEnd: studioDocument.backgroundMode === "gradient"
      ? studioDocument.backgroundGradientEnd || studioDocument.background
      : template.scene.backgroundEnd,
    gradientAngle: studioDocument.backgroundGradientAngle ?? template.scene.gradientAngle ?? 135,
    gradientStyle: studioDocument.backgroundGradientStyle ?? template.scene.gradientStyle ?? "linear",
    backgroundMedia: studioDocument.backgroundMode === "media"
      ? studioDocument.backgroundMedia ?? null
      : null,
    layers: template.scene.layers.map((layer) => {
      if (layer.type !== "text") return layer;
      const object = studioObjects.get(layer.id);
      if (!object || String(object.type).toLowerCase() !== "textbox") return layer;
      const autoFit = object.autoSize === "Grow to fit" ? "grow" : object.autoSize === "Shrink to fit" ? "shrink" : "none";
      return {
        ...layer,
        fontSize: effectiveStudioFontSize(object, typeof object.fontSize === "number" ? object.fontSize : layer.fontSize),
        charSpacing: typeof object.charSpacing === "number" ? object.charSpacing : layer.charSpacing,
        color: typeof object.fill === "string" ? object.fill : layer.color,
        fontFamily: typeof object.fontFamily === "string" ? object.fontFamily : layer.fontFamily,
        fontStyle: object.fontStyle === "italic" ? "italic" : layer.fontStyle,
        fontWeight: typeof object.fontWeight === "number" ? object.fontWeight : layer.fontWeight,
        align: object.textAlign === "left" || object.textAlign === "right" || object.textAlign === "center" ? object.textAlign : layer.align,
        backgroundColor: typeof object.backgroundColor === "string" ? object.backgroundColor : layer.backgroundColor,
        cornerRadius: typeof object.cornerRadius === "number" ? object.cornerRadius : layer.cornerRadius,
        boxBorderColor: typeof object.boxBorderColor === "string" ? object.boxBorderColor : layer.boxBorderColor,
        boxBorderWidth: typeof object.boxBorderWidth === "number" ? object.boxBorderWidth : layer.boxBorderWidth,
        lineHeight: typeof object.lineHeight === "number" ? object.lineHeight : layer.lineHeight,
        lineSpacing: typeof object.lineSpacing === "number" ? object.lineSpacing : layer.lineSpacing,
        lineBackgroundColor: typeof object.lineBackgroundColor === "string" ? object.lineBackgroundColor : layer.lineBackgroundColor,
        shadow: object.shadow && typeof object.shadow === "object" ? {
          color: typeof (object.shadow as Record<string, unknown>).color === "string" ? (object.shadow as Record<string, unknown>).color as string : "#000000",
          blur: typeof (object.shadow as Record<string, unknown>).blur === "number" ? (object.shadow as Record<string, unknown>).blur as number : 0,
          offsetX: typeof (object.shadow as Record<string, unknown>).offsetX === "number" ? (object.shadow as Record<string, unknown>).offsetX as number : 0,
          offsetY: typeof (object.shadow as Record<string, unknown>).offsetY === "number" ? (object.shadow as Record<string, unknown>).offsetY as number : 0,
        } : layer.shadow,
        scrollDuration: typeof object.scrollDuration === "number" ? object.scrollDuration : layer.scrollDuration,
        scrollGap: typeof object.scrollGap === "number" ? object.scrollGap : layer.scrollGap,
        autoFit,
        scriptStyles: {
          ...(layer.scriptStyles ?? {}),
          ...scriptStylesFromStudioObject(object),
        },
        textBackgroundStyles: {
          ...(layer.textBackgroundStyles ?? {}),
          ...textBackgroundStylesFromStudioObject(object),
        },
      };
    }),
  };
  projectionSceneCache.set(template, scene);
  return scene;
}
