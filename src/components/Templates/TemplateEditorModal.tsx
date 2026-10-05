import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Textbox } from "fabric";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

import type { TemplateCanvasTheme, TemplateCategory, TemplateLayer, TemplateScene, TemplateTextScript } from "../../types/templates";
import type { OverlayMode } from "../../types/state";
import { createEmptyStudioDocument, type StudioDocument } from "../../types/studioDocument";
import { useTemplateStore } from "../../stores/templateStore";
import { stageTemplateVideo } from "../../lib/templateVideo";
import { importErrorMessage, importVideo } from "../../lib/videoImport";
import { mediaCategoryForPath } from "../../lib/mediaLibrary";
import { isShortcutEvent, useShortcutStore } from "../../stores/shortcutStore";
import { FabricStudioCanvas, type StudioCanvasHandle, type StudioTextSelection } from "./FabricStudioCanvas";
import { StudioLayersPanel } from "./StudioLayersPanel";
import { StudioToolbar } from "./StudioToolbar";
import type { CameraEditMode } from "../../lib/cameraFrame";

interface TemplateEditorModalProps {
  open: boolean;
  mode: "create" | "edit";
  category: TemplateCategory;
  templateId: string | null;
  onClose: () => void;
}

function categoryLabel(category: TemplateCategory) {
  return category === "songs" ? "Song" : "Scripture";
}

function studioDocumentFromLegacyTemplate(template: TemplateCanvasTheme): StudioDocument {
  const { scene } = template;
  const width = scene.canvasWidth;
  const height = scene.canvasHeight;
  const objects = [...scene.layers].sort((a, b) => a.zIndex - b.zIndex).map((layer) => {
    const base = {
      left: layer.x / 100 * width,
      top: layer.y / 100 * height,
      width: layer.width / 100 * width,
      height: layer.height / 100 * height,
      angle: layer.rotation,
      opacity: layer.opacity,
      visible: layer.visible,
      selectable: !layer.locked,
      evented: !layer.locked,
      studioId: layer.id,
      studioRole: "layer" as const,
      studioName: layer.name,
      studioLocked: layer.locked,
    };
    if (layer.type === "text") {
      return {
        ...base,
        type: "Textbox",
        text: layer.content,
        fill: layer.color,
        stroke: layer.outlineColor || null,
        strokeWidth: layer.outlineWidth,
        fontFamily: layer.fontFamily === "var(--font-sans)" ? "Inter, system-ui, sans-serif" : layer.fontFamily,
        fontStyle: layer.fontStyle,
        fontSize: layer.fontSize,
        fontWeight: layer.fontWeight,
        textAlign: layer.align,
        lineHeight: layer.lineHeight,
        lineSpacing: layer.lineSpacing,
        charSpacing: layer.charSpacing,
        backgroundColor: layer.backgroundColor,
        cornerRadius: layer.cornerRadius,
        lineBackgroundColor: layer.lineBackgroundColor,
        shadow: layer.shadow,
        scrollDuration: layer.scrollDuration,
        scrollGap: layer.scrollGap,
        studioBoxHeight: base.height,
        autoSize: layer.autoFit === "grow" ? "Grow to fit" : layer.autoFit === "shrink" ? "Shrink to fit" : "None",
      };
    }
    return {
      ...base,
      type: layer.shapeKind === "circle" ? "Ellipse" : layer.shapeKind === "triangle" ? "Triangle" : layer.shapeKind === "line" ? "Line" : layer.shapeKind === "arrow" || layer.shapeKind === "polygon" || layer.shapeKind === "star" ? "Polygon" : "Rect",
      studioShapeKind: layer.shapeKind,
      fill: layer.fill,
      stroke: layer.borderColor || null,
      strokeWidth: layer.borderWidth,
      strokeDashArray: layer.borderDash === "dashed" ? [12, 8] : layer.borderDash === "dotted" ? [1, 6] : null,
      strokeLineCap: layer.borderLineCap,
      strokeLineJoin: layer.borderLineJoin,
      globalCompositeOperation: layer.blendMode,
      flipX: layer.flipX,
      flipY: layer.flipY,
      shadow: layer.shadow,
      polygonSides: layer.polygonSides,
      starPoints: layer.starPoints,
      starInnerRadius: layer.starInnerRadius,
      ...(layer.shapeKind === "circle" ? { rx: base.width / 2, ry: base.height / 2 } : { rx: layer.radius, ry: layer.radius }),
    };
  });
  const now = Date.now();
  return {
    id: `studio-${template.id}`,
    name: template.name,
    category: template.category,
    width,
    height,
    background: scene.backgroundStart,
    backgroundMode: scene.backgroundMedia ? "media" : "color",
    backgroundMedia: scene.backgroundMedia,
    fabricVersion: "7.0.0",
    objects,
    createdAt: template.createdAt,
    updatedAt: now,
  };
}

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

function sceneFromStudioDocument(document: StudioDocument, fallback: TemplateScene): TemplateScene {
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
    // The studio document is the authoring model, while ProjectorView reads
    // from the legacy-compatible scene model. Keep live camera backgrounds in
    // both models or they appear selected in the editor and disappear after
    // the template is saved.
    backgroundMedia: document.backgroundMedia ?? null,
    gradientAngle: document.backgroundGradientAngle ?? 135,
    gradientStyle: document.backgroundGradientStyle ?? "linear",
    layers: layers.length > 0 ? layers : fallback.layers,
  };
}

export function TemplateEditorModal(props: TemplateEditorModalProps) {
  const { open, mode, category, templateId, onClose } = props;
  const [document, setDocument] = useState<StudioDocument | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [textSelection, setTextSelection] = useState<StudioTextSelection | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isVideoStaging, setIsVideoStaging] = useState(false);
  const [videoImportPercent, setVideoImportPercent] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isTitlePromptOpen, setIsTitlePromptOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [titlePromptError, setTitlePromptError] = useState<string | null>(null);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const [screenLayout, setScreenLayout] = useState<OverlayMode>("widescreen");
  const [cameraEditMode, setCameraEditMode] = useState<CameraEditMode>("off");
  const templates = useTemplateStore((state) => state.templates);
  const templatesRef = useRef(templates);
  useEffect(() => { templatesRef.current = templates; }, [templates]);
  const createTemplateDraft = useTemplateStore((state) => state.createTemplateDraft);
  const upsertTemplate = useTemplateStore((state) => state.upsertTemplate);
  const shortcuts = useShortcutStore((state) => state.shortcuts);
  const canvasHandleRef = useRef<StudioCanvasHandle>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const shapeMediaInputRef = useRef<HTMLInputElement | null>(null);
  const shapeMediaTargetRef = useRef<string | null>(null);
  const shapeMediaTypeRef = useRef<"image" | "video">("image");
  const canvasImportRef = useRef<AbortController | null>(null);
  const canvasImportIdRef = useRef(0);

  useEffect(() => {
    if (!open) {
      canvasImportIdRef.current += 1;
      canvasImportRef.current?.abort();
      canvasImportRef.current = null;
    }
    return () => {
      if (!open) return;
      canvasImportIdRef.current += 1;
      canvasImportRef.current?.abort();
    };
  }, [open]);

  const importCanvasMedia = async (shapeId?: string) => {
    let importId = 0;
    try {
      const selected = await openDialog({
        multiple: false,
      });
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (!path) return;
      const name = path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") ?? "Media";
      const kind = mediaCategoryForPath(path);
      if (kind === "images") {
        const source = await invoke<string>("read_template_image_file", { path });
        if (shapeId) await canvasHandleRef.current?.setShapeMedia(shapeId, source, name, "image");
        else await canvasHandleRef.current?.addImage(source, name, "image");
        return;
      }
      canvasImportRef.current?.abort();
      importId = ++canvasImportIdRef.current;
      const controller = new AbortController();
      canvasImportRef.current = controller;
      setIsVideoStaging(true);
      setVideoImportPercent(null);
      const asset = await importVideo(path, {
        signal: controller.signal,
        onProgress: (event) => {
          if (canvasImportIdRef.current === importId) setVideoImportPercent(event.percent);
        },
      });
      if (canvasImportIdRef.current !== importId) return;
      if (shapeId) await canvasHandleRef.current?.setShapeMedia(shapeId, asset.path, name, "video");
      else await canvasHandleRef.current?.addImage(asset.path, name, "video");
    } catch (error) {
      if ((error as { code?: string })?.code !== "IMPORT_CANCELLED") {
        setSaveError(`The media could not be imported: ${importErrorMessage(error)}`);
      }
    } finally {
      if (importId !== 0 && canvasImportIdRef.current === importId) {
        setIsVideoStaging(false);
        setVideoImportPercent(null);
        canvasImportRef.current = null;
      }
    }
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (!open) {
        setDocument(null);
        setIsVideoStaging(false);
        setVideoImportPercent(null);
        setSelectedIds([]);
        setTextSelection(null);
        setSaveError(null);
        setIsTitlePromptOpen(false);
        setTitleDraft("");
        setTitlePromptError(null);
        return;
      }
      const existing = templateId ? templatesRef.current.find((entry) => entry.id === templateId) : undefined;
      setIsVideoStaging(false);
      setVideoImportPercent(null);
      const initialLayout = existing?.layout ?? "widescreen";
      setScreenLayout(initialLayout);
      const initialDocument = existing?.studioDocument ?? (existing
        ? studioDocumentFromLegacyTemplate(existing)
        : createEmptyStudioDocument(category, `New ${categoryLabel(category)} Template`));
      setCameraEditMode(initialDocument.backgroundMode === "media" && initialDocument.backgroundMedia?.type === "camera" ? "frame" : "off");
      setDocument(initialDocument);
      setSelectedIds([]);
      setTextSelection(null);
      setSaveError(null);
      setIsTitlePromptOpen(false);
      setTitleDraft("");
      setTitlePromptError(null);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [category, open, templateId]);

  const onDocumentChange = useCallback((patch: Partial<Pick<StudioDocument, "objects" | "background" | "backgroundMode" | "backgroundColor" | "backgroundGradientStart" | "backgroundGradientEnd" | "backgroundGradientAngle" | "backgroundGradientStyle" | "backgroundBlur" | "backgroundMedia" | "updatedAt">>) => {
    setDocument((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const defaultTextBox = useMemo(() => {
    if (!document) return { x: 0, y: 0, width: 400, height: 120 };
    const width = Math.round(document.width * 0.4);
    const height = Math.round(document.height * 0.15);
    return { x: Math.round((document.width - width) / 2), y: Math.round((document.height - height) / 2), width, height };
  }, [document]);

  const defaultShapeBox = useMemo(() => {
    if (!document) return { x: 0, y: 0, width: 200, height: 200 };
    const width = Math.round(document.width * 0.2);
    const height = Math.round(document.height * 0.2);
    return { x: Math.round((document.width - width) / 2), y: Math.round((document.height - height) / 2), width, height };
  }, [document]);

  const saveTemplate = async (titleOverride?: string) => {
    if (!document || isSaving || isVideoStaging) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      let currentDocument = canvasHandleRef.current?.toDocument() ?? document;
      const media = currentDocument.backgroundMedia;
      if (media?.type === "video" && media.src.startsWith("data:") && "__TAURI_INTERNALS__" in window) {
        const path = await stageTemplateVideo(media.src);
        const asset = await importVideo(path, { legacy: true });
        currentDocument = { ...currentDocument, backgroundMedia: { ...media, src: asset.path } };
      }
      const existing = templateId ? templates.find((entry) => entry.id === templateId) : undefined;
      const draft = existing ?? createTemplateDraft(category);
      const now = Date.now();
      const name = (titleOverride ?? currentDocument.name).trim() || draft.name;
      await upsertTemplate({
        ...draft,
        id: existing?.id ?? draft.id,
        category,
        layout: screenLayout,
        name,
        studioDocument: {
          ...currentDocument,
          id: existing?.studioDocument?.id ?? currentDocument.id,
          category,
          name,
          createdAt: existing?.studioDocument?.createdAt ?? currentDocument.createdAt,
          updatedAt: now,
        },
        scene: sceneFromStudioDocument(currentDocument, draft.scene),
        updatedAt: now,
      });
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save template");
    } finally {
      setIsSaving(false);
    }
  };

  const changeScreenLayout = (layout: OverlayMode) => {
    setScreenLayout(layout);
  };

  const requestSave = () => {
    if (!document || isSaving || isVideoStaging) return;
    const existing = templateId ? templates.find((entry) => entry.id === templateId) : undefined;
    if (existing) {
      void saveTemplate();
      return;
    }
    setTitleDraft(document.name.trim());
    setTitlePromptError(null);
    setIsTitlePromptOpen(true);
  };

  const confirmTitleAndSave = () => {
    const title = titleDraft.trim();
    if (!title) {
      setTitlePromptError("Enter a title for this template.");
      return;
    }
    void saveTemplate(title);
  };

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTextEditing = target?.tagName === "TEXTAREA" || target?.isContentEditable;
      const isFormEditing = isTextEditing || target?.tagName === "INPUT" || target?.tagName === "SELECT" || target?.tagName === "BUTTON";
      if (event.key === "Escape") {
        if (isTitlePromptOpen) {
          setIsTitlePromptOpen(false);
          return;
        }
        if (cameraEditMode === "crop") {
          setCameraEditMode("frame");
          return;
        }
        if (isTextEditing) return;
        if (selectedIds.length > 0) {
          canvasHandleRef.current?.getCanvas()?.discardActiveObject();
          canvasHandleRef.current?.getCanvas()?.requestRenderAll();
          return;
        }
        onClose();
        return;
      }
      if (!isFormEditing && isShortcutEvent(event, shortcuts["template-undo"])) {
        event.preventDefault();
        void canvasHandleRef.current?.undo();
        return;
      }
      const canvas = canvasHandleRef.current?.getCanvas();
      const activeCanvasObject = canvas?.getActiveObject();
      const isCanvasTextEditing = activeCanvasObject instanceof Textbox && activeCanvasObject.isEditing;
      if (!isFormEditing && !isCanvasTextEditing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
        event.preventDefault();
        void canvasHandleRef.current?.copySelection();
        return;
      }
      if (!isFormEditing && !isCanvasTextEditing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
        event.preventDefault();
        void canvasHandleRef.current?.pasteSelection();
        return;
      }
      if (!isFormEditing && !isCanvasTextEditing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "g") {
        event.preventDefault();
        canvasHandleRef.current?.groupSelection();
        return;
      }
      if (!isFormEditing && !isCanvasTextEditing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "u") {
        event.preventDefault();
        canvasHandleRef.current?.ungroupSelection();
        return;
      }
      if (!isFormEditing && isShortcutEvent(event, shortcuts["template-redo"])) {
        event.preventDefault();
        void canvasHandleRef.current?.redo();
        return;
      }
      if (event.key === "Delete" && !isFormEditing && selectedIds.length > 0) {
        event.preventDefault();
        canvasHandleRef.current?.deleteSelection();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cameraEditMode, isTitlePromptOpen, onClose, open, selectedIds, shortcuts]);

  if (!open || !document) {
    return null;
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Template editor"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        background: "var(--overlay-backdrop)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        className="studio-modal"
        style={{
          width: "min(1180px, 96vw)",
          height: "min(760px, 92vh)",
          background: "var(--bg-base)",
          borderRadius: "12px",
          border: "1px solid var(--border-base)",
          display: "grid",
          gridTemplateRows: "auto minmax(0, 1fr) auto",
          overflow: "hidden",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            borderBottom: "1px solid var(--border-base)",
            padding: "10px 14px",
            background: "var(--bg-surface)",
          }}
        >
          <div style={{ display: "grid", gap: "2px" }}>
            <span style={{ color: "var(--fg-base)", fontWeight: 700, fontSize: "14px" }}>
              {mode === "edit" ? "Edit Template" : "Create Template"}
            </span>
            <span style={{ color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.06em" }}>
              {categoryLabel(category).toUpperCase()} · CANVAS AUTHORING
            </span>
          </div>
          {isVideoStaging ? <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--fg-muted)", fontSize: 11 }}>
            Preparing video{videoImportPercent == null ? "…" : ` · ${videoImportPercent}%`}
            <button type="button" onClick={() => {
              canvasImportIdRef.current += 1;
              canvasImportRef.current?.abort();
              canvasImportRef.current = null;
              setIsVideoStaging(false);
              setVideoImportPercent(null);
            }}>Cancel</button>
          </div> : null}
          <button
            type="button"
            onClick={onClose}
            style={{ border: "none", background: "var(--bg-elevated)", color: "var(--fg-base)", borderRadius: "6px", width: "28px", height: "28px", cursor: "pointer" }}
            title="Close"
          >
            ×
          </button>
        </header>

        <div style={{ minHeight: 0, minWidth: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 260px" }}>
          <div style={{ position: "relative", minHeight: 0, minWidth: 0 }}>
            <FabricStudioCanvas
              document={document}
              cameraEditMode={cameraEditMode}
              handleRef={canvasHandleRef}
              onSelectionChange={setSelectedIds}
              onTextSelectionChange={setTextSelection}
              onDocumentChange={onDocumentChange}
              onHistoryChange={setHistoryState}
            />
            <StudioToolbar
              onAddText={() => canvasHandleRef.current?.addText(defaultTextBox)}
              onAddShape={(kind) => canvasHandleRef.current?.addShape(kind, defaultShapeBox)}
              onAddMedia={() => {
                if ("__TAURI_INTERNALS__" in window) void importCanvasMedia();
                else mediaInputRef.current?.click();
              }}
            />
            <input
              ref={mediaInputRef}
              type="file"
              accept="image/*,video/*"
              hidden
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                const mediaType = file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|ogg)$/i.test(file.name) ? "video" : "image";
                if (mediaType === "video") { setSaveError("Open SermonSync in the desktop app to import videos."); return; }
                const reader = new FileReader();
                reader.onload = () => void canvasHandleRef.current?.addImage(String(reader.result), file.name.replace(/\.[^.]+$/, ""), mediaType);
                reader.readAsDataURL(file);
              }}
            />
            <input
              ref={shapeMediaInputRef}
              type="file"
              accept="image/*,video/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                const studioId = shapeMediaTargetRef.current;
                shapeMediaTargetRef.current = null;
                if (!file || !studioId) return;
                const mediaType = file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|ogg)$/i.test(file.name) ? "video" : "image";
                if (mediaType === "video") { setSaveError("Open SermonSync in the desktop app to import videos."); return; }
                const reader = new FileReader();
                reader.onload = () => void canvasHandleRef.current?.setShapeMedia(studioId, String(reader.result), file.name.replace(/\.[^.]+$/, ""), mediaType);
                reader.readAsDataURL(file);
              }}
            />
          </div>

          <StudioLayersPanel
            objects={document.objects}
            selectedIds={selectedIds}
            textSelection={textSelection}
            onSelect={(studioId) => canvasHandleRef.current?.selectById(studioId)}
            onToggleVisibility={(studioId, visible) => canvasHandleRef.current?.setVisible(studioId, visible)}
            onToggleLock={(studioId, locked) => canvasHandleRef.current?.setLocked(studioId, locked)}
            onUpdate={(studioId, props) => canvasHandleRef.current?.updateObject(studioId, props)}
            onSetShapeMedia={(studioId, mediaType = "image") => {
              if (mediaType === "video" && "__TAURI_INTERNALS__" in window) {
                void importCanvasMedia(studioId);
                return;
              }
              shapeMediaTargetRef.current = studioId;
              shapeMediaTypeRef.current = mediaType;
              if (shapeMediaInputRef.current) shapeMediaInputRef.current.accept = mediaType === "video" ? "video/*" : "image/*";
              shapeMediaInputRef.current?.click();
            }}
            onClearShapeMedia={(studioId) => void canvasHandleRef.current?.setShapeMedia(studioId, null)}
            onReorder={(studioId, direction) => canvasHandleRef.current?.reorderObject(studioId, direction)}
            canUndo={historyState.canUndo}
            canRedo={historyState.canRedo}
            onUndo={() => void canvasHandleRef.current?.undo()}
            onRedo={() => void canvasHandleRef.current?.redo()}
            background={document.background}
            onBackgroundChange={(background) => canvasHandleRef.current?.setBackground(background)}
            backgroundMode={document.backgroundMode ?? "color"}
            backgroundColor={document.backgroundColor ?? document.background}
            backgroundGradientStart={document.backgroundGradientStart ?? "#0f1117"}
            backgroundGradientEnd={document.backgroundGradientEnd ?? "#25204a"}
            backgroundGradientAngle={document.backgroundGradientAngle ?? 135}
            backgroundGradientStyle={document.backgroundGradientStyle ?? "linear"}
            backgroundBlur={document.backgroundBlur ?? 0}
            backgroundMedia={document.backgroundMedia ?? null}
            cameraEditMode={cameraEditMode}
            onCameraEditModeChange={(mode) => {
              if (mode === "crop") {
                canvasHandleRef.current?.getCanvas()?.discardActiveObject();
                canvasHandleRef.current?.getCanvas()?.requestRenderAll();
                setSelectedIds([]);
              }
              setCameraEditMode(mode);
            }}
            onBackgroundVideoStagingChange={setIsVideoStaging}
            onBackgroundConfigChange={(config) => { setCameraEditMode((current) => config.mode === "media" && config.media?.type === "camera" ? (current === "crop" ? "crop" : "frame") : "off"); canvasHandleRef.current?.setBackgroundConfig(config); }}
            screenLayout={screenLayout}
            onScreenLayoutChange={changeScreenLayout}
            onDelete={(studioId) => {
              canvasHandleRef.current?.selectById(studioId);
              canvasHandleRef.current?.deleteSelection();
            }}
          />
        </div>

        <footer
          style={{
            borderTop: "1px solid var(--border-base)",
            padding: "10px 14px",
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            background: "var(--bg-surface)",
          }}
        >
          {saveError ? <span style={{ marginRight: "auto", alignSelf: "center", color: "var(--color-error)", fontSize: "12px" }}>{saveError}</span> : null}
          <button
            type="button"
            onClick={onClose}
            style={{ border: "1px solid var(--border-base)", background: "var(--bg-elevated)", color: "var(--fg-base)", borderRadius: "8px", padding: "8px 12px", cursor: "pointer" }}
          >
            Close
          </button>
          <button
            type="button"
            onClick={requestSave}
            disabled={isSaving || isVideoStaging}
            style={{ border: "none", background: isSaving || isVideoStaging ? "var(--bg-elevated)" : "var(--color-primary)", color: isSaving || isVideoStaging ? "var(--fg-subtle)" : "white", borderRadius: "8px", padding: "8px 12px", fontWeight: 700, cursor: isSaving || isVideoStaging ? "wait" : "pointer" }}
          >
            {isVideoStaging ? "Importing video..." : isSaving ? "Saving..." : "Save Template"}
          </button>
        </footer>
      </div>

      {isTitlePromptOpen ? (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSaving) setIsTitlePromptOpen(false);
          }}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            background: "color-mix(in srgb, var(--overlay-backdrop) 72%, transparent)",
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-template-title"
            onSubmit={(event) => {
              event.preventDefault();
              confirmTitleAndSave();
            }}
            style={{
              width: "min(400px, 100%)",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-base)",
              borderRadius: "12px",
              boxShadow: "var(--shadow-lg)",
              padding: "18px",
            }}
          >
            <div style={{ display: "grid", gap: "5px", marginBottom: "16px" }}>
              <div id="save-template-title" style={{ color: "var(--fg-base)", fontSize: "16px", fontWeight: 700 }}>
                Save template
              </div>
              <div style={{ color: "var(--fg-subtle)", fontSize: "12px", lineHeight: 1.45 }}>
                Give this {categoryLabel(category).toLowerCase()} template a name so you can find it later.
              </div>
            </div>
            <label style={{ display: "grid", gap: "6px", color: "var(--fg-muted)", fontSize: "11px", fontWeight: 700 }}>
              Template title
              <input
                autoFocus
                value={titleDraft}
                onChange={(event) => {
                  setTitleDraft(event.target.value);
                  if (titlePromptError) setTitlePromptError(null);
                }}
                placeholder={`New ${categoryLabel(category)} Template`}
                aria-invalid={Boolean(titlePromptError)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  border: `1px solid ${titlePromptError ? "var(--color-error)" : "var(--border-base)"}`,
                  borderRadius: "7px",
                  background: "var(--bg-elevated)",
                  color: "var(--fg-base)",
                  padding: "10px 11px",
                  font: "inherit",
                  fontSize: "13px",
                  outline: "none",
                }}
              />
              {titlePromptError ? <span style={{ color: "var(--color-error)", fontSize: "11px", fontWeight: 500 }}>{titlePromptError}</span> : null}
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "18px" }}>
              <button
                type="button"
                onClick={() => setIsTitlePromptOpen(false)}
                disabled={isSaving}
                style={{ border: "1px solid var(--border-base)", background: "var(--bg-elevated)", color: "var(--fg-base)", borderRadius: "8px", padding: "8px 12px", cursor: isSaving ? "not-allowed" : "pointer" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                style={{ border: "none", background: isSaving ? "var(--bg-elevated)" : "var(--color-primary)", color: isSaving ? "var(--fg-subtle)" : "white", borderRadius: "8px", padding: "8px 12px", fontWeight: 700, cursor: isSaving ? "wait" : "pointer" }}
              >
                {isSaving ? "Saving..." : "Save template"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>,
    globalThis.document.body,
  );
}
