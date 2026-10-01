/** Flattens a Fabric studio document into the layer-based TemplateScene used for projection. */
import type { TemplateLayer, TemplateScene, TemplateTextScript } from "../../../types/templates";
import type { StudioDocument } from "../../../types/studioDocument";

function scriptStylesFromStudioObject(object: Record<string, unknown>): Record<string, TemplateTextScript> {
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

export function sceneFromStudioDocument(document: StudioDocument, fallback: TemplateScene): TemplateScene {
  const numberValue = (value: unknown, defaultValue = 0) => typeof value === "number" && Number.isFinite(value) ? value : defaultValue;
  const objectNumber = (object: Record<string, unknown>, key: string, defaultValue = 0) => numberValue(object[key], defaultValue);
  const flattenObjects = (objects: Array<Record<string, unknown>>, parent = { left: 0, top: 0, scaleX: 1, scaleY: 1, angle: 0, opacity: 1, visible: true }): Array<Record<string, unknown>> => objects.flatMap((object) => {
    const localLeft = objectNumber(object, "left");
    const localTop = objectNumber(object, "top");
    const radians = parent.angle * Math.PI / 180;
    const scaledLeft = localLeft * parent.scaleX;
    const scaledTop = localTop * parent.scaleY;
    const composite = {
      ...object,
      left: parent.left + scaledLeft * Math.cos(radians) - scaledTop * Math.sin(radians),
      top: parent.top + scaledLeft * Math.sin(radians) + scaledTop * Math.cos(radians),
      scaleX: objectNumber(object, "scaleX", 1) * parent.scaleX,
      scaleY: objectNumber(object, "scaleY", 1) * parent.scaleY,
      angle: objectNumber(object, "angle") + parent.angle,
      opacity: objectNumber(object, "opacity", 1) * parent.opacity,
      visible: object.visible !== false && parent.visible,
    };
    const children = object.objects;
    const isGroup = String(object.type ?? "").toLowerCase() === "group";
    const groupWidth = objectNumber(object, "width") * composite.scaleX;
    const groupHeight = objectNumber(object, "height") * composite.scaleY;
    return isGroup && Array.isArray(children)
      ? flattenObjects(children.filter((child): child is Record<string, unknown> => Boolean(child) && typeof child === "object"), {
          ...composite,
          left: composite.left + groupWidth / 2,
          top: composite.top + groupHeight / 2,
        })
      : [composite];
  });
  const effectiveTextFontSize = (object: Record<string, unknown>, fallbackSize: number) => {
    const serializedStyles = object.styles;
    if (!serializedStyles || typeof serializedStyles !== "object") return fallbackSize;
    if (Array.isArray(serializedStyles)) {
      const fontSizes = serializedStyles.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const style = (entry as Record<string, unknown>).style;
        const value = style && typeof style === "object" ? (style as Record<string, unknown>).fontSize : undefined;
        return typeof value === "number" && Number.isFinite(value) ? [value] : [];
      });
      if (fontSizes.length === 0) return fallbackSize;
      const first = fontSizes[0];
      return fontSizes.every((size) => Math.abs(size - first) < 0.01) ? first : fallbackSize;
    }
    const fontSizes = Object.values(serializedStyles as Record<string, unknown>).flatMap((line) => {
      if (!line || typeof line !== "object") return [];
      return Object.values(line as Record<string, unknown>).map((style) => {
        if (!style || typeof style !== "object") return null;
        const value = (style as Record<string, unknown>).fontSize;
        return typeof value === "number" && Number.isFinite(value) ? value : null;
      });
    }).filter((value): value is number => value !== null);
    if (fontSizes.length === 0) return fallbackSize;
    const first = fontSizes[0];
    return fontSizes.every((size) => Math.abs(size - first) < 0.01) ? first : fallbackSize;
  };
  const width = Math.max(1, document.width);
  const height = Math.max(1, document.height);
  const layers: TemplateLayer[] = flattenObjects(document.objects).flatMap((object, index): TemplateLayer[] => {
    const type = String(object.type ?? "").toLowerCase();
    const objectWidth = objectNumber(object, "width") * objectNumber(object, "scaleX", 1);
    const objectHeight = objectNumber(object, "studioBoxHeight", objectNumber(object, "height")) * objectNumber(object, "scaleY", 1);
    if (objectWidth <= 0 || objectHeight <= 0) return [];
    const base = {
      id: typeof object.studioId === "string" ? object.studioId : `studio-layer-${index + 1}`,
      name: typeof object.studioName === "string" ? object.studioName : `Layer ${index + 1}`,
      visible: object.visible !== false,
      locked: object.studioLocked === true,
      x: objectNumber(object, "left") / width * 100,
      y: objectNumber(object, "top") / height * 100,
      width: objectWidth / width * 100,
      height: objectHeight / height * 100,
      rotation: objectNumber(object, "angle"),
      zIndex: index + 1,
      opacity: objectNumber(object, "opacity", 1),
    };
    if (type === "textbox" || type === "i-text") {
      const autoSize = object.autoSize === "Grow to fit" ? "grow" : object.autoSize === "Shrink to fit" ? "shrink" : "none";
      const scriptStyles = scriptStylesFromStudioObject(object);
      return [{
        ...base,
        type: "text" as const,
        content: typeof object.text === "string" ? object.text : "",
        color: typeof object.fill === "string" ? object.fill : "#f4f7ff",
        outlineColor: typeof object.stroke === "string" ? object.stroke : "",
        outlineWidth: objectNumber(object, "strokeWidth"),
        boxBorderColor: typeof object.boxBorderColor === "string" ? object.boxBorderColor : typeof object.stroke === "string" ? object.stroke : "",
        boxBorderWidth: objectNumber(object, "boxBorderWidth", objectNumber(object, "strokeWidth")),
        fontFamily: typeof object.fontFamily === "string" ? object.fontFamily : "Inter, system-ui, sans-serif",
        fontStyle: object.fontStyle === "italic" ? "italic" as const : "normal" as const,
        fontSize: effectiveTextFontSize(object, objectNumber(object, "fontSize", 28)),
        fontWeight: objectNumber(object, "fontWeight", 400),
        align: object.textAlign === "left" || object.textAlign === "right" ? object.textAlign : "center" as const,
        lineHeight: objectNumber(object, "lineHeight", 1.16),
        lineSpacing: objectNumber(object, "lineSpacing"),
        charSpacing: objectNumber(object, "charSpacing"),
        backgroundColor: typeof object.backgroundColor === "string" ? object.backgroundColor : "",
        cornerRadius: objectNumber(object, "cornerRadius"),
        lineBackgroundColor: typeof object.lineBackgroundColor === "string" ? object.lineBackgroundColor : "",
        shadow: object.shadow && typeof object.shadow === "object" ? {
          color: typeof (object.shadow as Record<string, unknown>).color === "string" ? (object.shadow as Record<string, unknown>).color as string : "#000000",
          blur: objectNumber(object.shadow as Record<string, unknown>, "blur"),
          offsetX: objectNumber(object.shadow as Record<string, unknown>, "offsetX"),
          offsetY: objectNumber(object.shadow as Record<string, unknown>, "offsetY"),
        } : null,
        scrollDuration: objectNumber(object, "scrollDuration"),
        scrollGap: objectNumber(object, "scrollGap", 100),
        autoFit: autoSize as "none" | "grow" | "shrink",
        ...(Object.keys(scriptStyles).length > 0 ? { scriptStyles } : {}),
      }];
    }
    if (type === "rect" || type === "ellipse" || type === "triangle" || type === "line" || type === "polygon") {
      const storedKind = object.studioShapeKind;
      const shapeKind = storedKind === "rectangle" || storedKind === "square" || storedKind === "circle" || storedKind === "triangle" || storedKind === "line" || storedKind === "arrow" || storedKind === "polygon" || storedKind === "star"
        ? storedKind
        : type === "ellipse" ? "circle" : type === "triangle" ? "triangle" : type === "line" ? "line" : "rectangle";
      const dash = Array.isArray(object.strokeDashArray) ? object.strokeDashArray : [];
      const pattern = object.fill && typeof object.fill === "object" ? object.fill as Record<string, unknown> : null;
      const patternSource = pattern?.type === "pattern" && typeof pattern.source === "string" ? pattern.source : undefined;
      const fillImage = typeof object.studioShapeFillMediaSource === "string" ? object.studioShapeFillMediaSource : patternSource;
      const fillImageType = object.studioShapeFillMediaType === "video" ? "video" as const : "image" as const;
      const fillFit = object.studioShapeFillFit === "contain" || object.studioShapeFillFit === "tile" ? object.studioShapeFillFit : "cover";
      return [{
        ...base,
        type: "shape" as const,
        shapeKind,
        fill: typeof object.fill === "string" ? object.fill : typeof object.studioShapeFillColor === "string" ? object.studioShapeFillColor : "#101319",
        fillMode: fillImage ? "image" as const : "solid" as const,
        ...(fillImage ? { fillImage } : {}),
        ...(fillImage ? { fillImageType } : {}),
        ...(fillImage ? { fillImageFit: fillFit } : {}),
        ...(fillImage ? { fillImageScale: objectNumber(object, "studioShapeFillScale", 100) } : {}),
        ...(fillImage ? { fillImageX: objectNumber(object, "studioShapeFillX"), fillImageY: objectNumber(object, "studioShapeFillY") } : {}),
        ...(fillImage ? { fillImageOpacity: objectNumber(object, "studioShapeFillOpacity", 1) } : {}),
        borderColor: typeof object.stroke === "string" ? object.stroke : "",
        borderWidth: objectNumber(object, "strokeWidth", 1),
        radius: objectNumber(object, "rx", 8),
        borderDash: dash.length === 0 ? "solid" : dash[0] === 1 ? "dotted" : "dashed",
        borderLineCap: object.strokeLineCap === "butt" || object.strokeLineCap === "square" ? object.strokeLineCap : "round",
        borderLineJoin: object.strokeLineJoin === "miter" || object.strokeLineJoin === "bevel" ? object.strokeLineJoin : "round",
        blendMode: typeof object.globalCompositeOperation === "string" ? object.globalCompositeOperation : "source-over",
        flipX: object.flipX === true,
        flipY: object.flipY === true,
        polygonSides: objectNumber(object, "polygonSides", 6),
        starPoints: objectNumber(object, "starPoints", 5),
        starInnerRadius: objectNumber(object, "starInnerRadius", 0.44) * 100,
        shadow: object.shadow && typeof object.shadow === "object" ? {
          color: typeof (object.shadow as Record<string, unknown>).color === "string" ? (object.shadow as Record<string, unknown>).color as string : "#000000",
          blur: objectNumber(object.shadow as Record<string, unknown>, "blur"),
          offsetX: objectNumber(object.shadow as Record<string, unknown>, "offsetX"),
          offsetY: objectNumber(object.shadow as Record<string, unknown>, "offsetY"),
        } : null,
      }];
    }
    // Legacy safety net: templates saved before media add-ons became pattern-filled
    // shapes may still contain bare Fabric images with no shape settings.
    if (type === "image") {
      const source = typeof object.src === "string" ? object.src : undefined;
      if (!source) return [];
      return [{
        ...base,
        type: "shape" as const,
        shapeKind: "rectangle" as const,
        fill: "#101319",
        fillMode: "image" as const,
        fillImage: source,
        fillImageType: "image" as const,
        fillImageFit: "cover" as const,
        fillImageScale: 100,
        fillImageX: 0,
        fillImageY: 0,
        fillImageOpacity: objectNumber(object, "opacity", 1),
        borderColor: "",
        borderWidth: 0,
        radius: 0,
        borderDash: "solid" as const,
        borderLineCap: "round" as const,
        borderLineJoin: "round" as const,
        blendMode: typeof object.globalCompositeOperation === "string" ? object.globalCompositeOperation : "source-over",
        flipX: object.flipX === true,
        flipY: object.flipY === true,
        polygonSides: 6,
        starPoints: 5,
        starInnerRadius: 44,
        shadow: object.shadow && typeof object.shadow === "object" ? {
          color: typeof (object.shadow as Record<string, unknown>).color === "string" ? (object.shadow as Record<string, unknown>).color as string : "#000000",
          blur: objectNumber(object.shadow as Record<string, unknown>, "blur"),
          offsetX: objectNumber(object.shadow as Record<string, unknown>, "offsetX"),
          offsetY: objectNumber(object.shadow as Record<string, unknown>, "offsetY"),
        } : null,
      }];
    }
    return [];
  });
  return {
    ...fallback,
    canvasWidth: document.width,
    canvasHeight: document.height,
    backgroundStart: document.background,
    gradientAngle: document.backgroundGradientAngle ?? 135,
    gradientStyle: document.backgroundGradientStyle ?? "linear",
    layers: layers.length > 0 ? layers : fallback.layers,
  };
}
