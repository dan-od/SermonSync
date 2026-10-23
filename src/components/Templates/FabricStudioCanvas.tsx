/**
 * Template Studio — base Fabric.js canvas.
 *
 * This is the foundational editor surface: canvas lifecycle, resize-to-fit,
 * document load/save via Fabric's own toObject()/loadFromJSON(), and
 * selection sync. Per https://fabricjs.com/docs/events/#when-to-use-events —
 * events are used here only for what Fabric itself owns (selection); object
 * creation and mutation are plain imperative calls, not event-driven.
 */
import { useEffect, useImperativeHandle, useRef, useState, type CSSProperties } from "react";
import { ActiveSelection, Canvas, FabricImage, FabricObject, Group, Pattern, Polygon, Rect, Textbox } from "fabric";
import { createStudioCanvas } from "../../lib/fabricDefaults";
import { CameraViewport } from "../CameraViewport";
import { ResilientVideo } from "../ResilientVideo";
import { type TemplateBackgroundMedia } from "../../types/templates";
import { CameraFrameControls } from "./CameraFrameControls";
import { type FabricStudioCanvasProps, type StudioCanvasSnapshot } from "./studioCanvas/types";
import { canvasSnapshot, snapshotsEqual, nextStudioId, nextStudioName, findByStudioId } from "./studioCanvas/snapshot";
import { isShapeObject, videoFrameSource, shapeMediaFallbackPreview, shapeMediaPattern, refreshShapeMediaPattern, shapeMediaVideo, hydrateShapeMedia } from "./studioCanvas/shapeMedia";
import { radialPoints, shapeFactory } from "./studioCanvas/shapes";
import { configureStudioTextbox, type StudioAutoSize, normalizeStudioScript, normalizeStudioTextCase, applyTextCase, scriptRange, applyTextScript, updateScriptFontSize, applyAutoSize, selectionStylesFrom, selectionStyleSummary } from "./studioCanvas/textbox";
export type { StudioShapeKind, StudioCanvasHandle, StudioTextSelection } from "./studioCanvas/types";

export function FabricStudioCanvas({ document, cameraEditMode = "off", onSelectionChange, onTextSelectionChange, onDocumentChange, onHistoryChange, handleRef }: FabricStudioCanvasProps) {
    const clipboardRef = useRef<FabricObject[]>([]);
    const pasteOffsetRef = useRef(0);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const documentRef = useRef(document);
  const callbacksRef = useRef({ onSelectionChange, onTextSelectionChange, onDocumentChange, onHistoryChange });
  const textSelectionRef = useRef(new Map<string, { start: number; end: number }>());
  const historyPastRef = useRef<StudioCanvasSnapshot[]>([]);
  const historyFutureRef = useRef<StudioCanvasSnapshot[]>([]);
  const lastSnapshotRef = useRef<StudioCanvasSnapshot | null>(null);
  const cameraGestureStartRef = useRef<StudioCanvasSnapshot | null>(null);
  const restoringHistoryRef = useRef(false);
  const historyOperationRef = useRef<Promise<void> | null>(null);
  const undoRef = useRef<() => Promise<void>>(async () => undefined);
  const redoRef = useRef<() => Promise<void>>(async () => undefined);
  const emitDocumentChangeRef = useRef<() => void>(() => undefined);
  const shapeMediaVideosRef = useRef(new Map<string, HTMLVideoElement>());
  const mediaEditTargetRef = useRef<FabricObject | null>(null);
  const mediaResizeStartRef = useRef<{ target: FabricObject; scaleX: number; scaleY: number; mediaScale: number } | null>(null);
  const [guides, setGuides] = useState<{ vertical: number[]; horizontal: number[] }>({ vertical: [], horizontal: [] });
  const [canvasReady, setCanvasReady] = useState(false);
  const [cameraError, setCameraError] = useState<{ source: string; message: string } | null>(null);
  const [cameraRetryToken, setCameraRetryToken] = useState(0);
  const cameraSourceKey = [document.cameraMedia?.cameraSourceType, document.cameraMedia?.cameraDeviceId, document.cameraMedia?.cameraLabel, document.cameraMedia?.cameraUrl].join("|");

  useEffect(() => {
    documentRef.current = document;
  }, [document]);

  useEffect(() => {
    callbacksRef.current = { onSelectionChange, onTextSelectionChange, onDocumentChange, onHistoryChange };
  }, [onDocumentChange, onHistoryChange, onSelectionChange, onTextSelectionChange]);

  // Canvas lifecycle: one Fabric.Canvas instance for the component's life.
  useEffect(() => {
    const element = canvasElementRef.current;
    if (!element) return;
    const canvas = createStudioCanvas(element);
    canvas.centeredScaling = false;
    canvasRef.current = canvas;
    const textSelectionRanges = textSelectionRef.current;
    const shapeMediaVideos = shapeMediaVideosRef.current;

    const emitTextSelection = (target?: FabricObject) => {
      if (!(target instanceof Textbox) || !target.studioId) {
        callbacksRef.current.onTextSelectionChange(null);
        return;
      }
      const remembered = textSelectionRanges.get(target.studioId);
      const range = target.isEditing && target.selectionEnd > target.selectionStart
        ? { start: target.selectionStart, end: target.selectionEnd }
        : remembered;
      if (!range || range.end <= range.start) {
        callbacksRef.current.onTextSelectionChange(null);
        return;
      }
      callbacksRef.current.onTextSelectionChange({
        studioId: target.studioId,
        ...range,
        styles: selectionStyleSummary(target, range.start, range.end),
      });
    };

    const emitSelection = () => {
      const ids = canvas
        .getActiveObjects()
        .map((object) => object.studioId)
        .filter((id): id is string => Boolean(id));
      callbacksRef.current.onSelectionChange(ids);
      emitTextSelection(canvas.getActiveObject() ?? undefined);
    };
    const publishHistoryState = () => {
      callbacksRef.current.onHistoryChange({
        canUndo: historyPastRef.current.length > 0,
        canRedo: historyFutureRef.current.length > 0,
      });
    };
    const emitDocumentChange = () => {
      const nextSnapshot = canvasSnapshot(canvas, documentRef.current);
      const previousSnapshot = lastSnapshotRef.current;
      if (!restoringHistoryRef.current && previousSnapshot && !snapshotsEqual(previousSnapshot, nextSnapshot)) {
        historyPastRef.current.push(previousSnapshot);
        historyFutureRef.current = [];
        publishHistoryState();
      }
      lastSnapshotRef.current = nextSnapshot;
      callbacksRef.current.onDocumentChange({ objects: nextSnapshot.objects, updatedAt: Date.now() });
    };
    emitDocumentChangeRef.current = emitDocumentChange;
    const restoreSnapshot = async (snapshot: StudioCanvasSnapshot) => {
      restoringHistoryRef.current = true;
      try {
        const canvasChanged = snapshot.objects !== lastSnapshotRef.current?.objects || snapshot.background !== lastSnapshotRef.current?.background;
        documentRef.current = { ...documentRef.current, background: snapshot.background, backgroundMode: snapshot.backgroundMode, backgroundMedia: snapshot.backgroundMedia, cameraMedia: snapshot.cameraMedia };
        if (canvasChanged) {
          await canvas.loadFromJSON({ objects: snapshot.objects, background: snapshot.background });
          canvas.getObjects().forEach((object) => {
            if (object instanceof Textbox) configureStudioTextbox(object, object.studioBoxHeight ?? object.height);
          });
          await hydrateShapeMedia(canvas, shapeMediaVideosRef.current, () => undefined);
          canvas.discardActiveObject();
          canvas.requestRenderAll();
        }
        lastSnapshotRef.current = snapshot;
        callbacksRef.current.onSelectionChange([]);
        callbacksRef.current.onTextSelectionChange(null);
        callbacksRef.current.onDocumentChange({ objects: snapshot.objects, background: snapshot.background, backgroundMode: snapshot.backgroundMode, backgroundMedia: snapshot.backgroundMedia, cameraMedia: snapshot.cameraMedia, updatedAt: Date.now() });
      } finally {
        restoringHistoryRef.current = false;
      }
    };
    const undo = async () => {
      const current = lastSnapshotRef.current;
      const previous = historyPastRef.current.pop();
      if (!current || !previous) {
        publishHistoryState();
        return;
      }
      historyFutureRef.current.push(current);
      await restoreSnapshot(previous);
      publishHistoryState();
    };
    const redo = async () => {
      const current = lastSnapshotRef.current;
      const next = historyFutureRef.current.pop();
      if (!current || !next) {
        publishHistoryState();
        return;
      }
      historyPastRef.current.push(current);
      await restoreSnapshot(next);
      publishHistoryState();
    };
    const queueHistoryOperation = (operation: () => Promise<void>) => {
      if (historyOperationRef.current) return historyOperationRef.current;
      const pending = operation().finally(() => {
        if (historyOperationRef.current === pending) historyOperationRef.current = null;
      });
      historyOperationRef.current = pending;
      return pending;
    };
    undoRef.current = () => queueHistoryOperation(undo);
    redoRef.current = () => queueHistoryOperation(redo);
    const rememberTextSelection = ({ target }: { target?: FabricObject }) => {
      if (!(target instanceof Textbox) || !target.studioId) return;
      textSelectionRanges.set(target.studioId, {
        start: target.selectionStart,
        end: target.selectionEnd,
      });
      emitTextSelection(target);
    };

    canvas.on("selection:created", emitSelection);
    canvas.on("selection:updated", emitSelection);
    canvas.on("selection:cleared", () => {
      textSelectionRanges.clear();
      callbacksRef.current.onSelectionChange([]);
      callbacksRef.current.onTextSelectionChange(null);
    });
    canvas.on("object:modified", ({ target }: { target?: FabricObject }) => {
      if (target && target === mediaEditTargetRef.current && mediaResizeStartRef.current) return;
      emitDocumentChange();
    });
    canvas.on("text:changed", ({ target }: { target?: FabricObject }) => {
      if (target instanceof Textbox && target.autoSize && target.autoSize !== "None") {
        applyAutoSize(target, target.autoSize, { start: 0, end: target.text.length });
        target.setCoords();
      }
      emitDocumentChange();
    });
    canvas.on("text:selection:changed", rememberTextSelection);
    canvas.on("mouse:dblclick", ({ target }: { target?: FabricObject }) => {
      if (target && isShapeObject(target) && typeof target.studioShapeFillMediaSource === "string") {
        mediaEditTargetRef.current = target;
        canvas.setActiveObject(target);
        target.setCoords();
        canvas.requestRenderAll();
      } else {
        mediaEditTargetRef.current = null;
      }
    });
    canvas.on("mouse:down", ({ target }: { target?: FabricObject }) => {
      if (target && target === mediaEditTargetRef.current && target.fill instanceof Pattern) {
        mediaResizeStartRef.current = {
          target,
          scaleX: target.scaleX,
          scaleY: target.scaleY,
          mediaScale: target.studioShapeFillScale ?? 100,
        };
      } else {
        mediaResizeStartRef.current = null;
      }
      // Clicking the canvas starts a new interaction. An inspector click does
      // not reach the Fabric canvas, so the remembered range remains available
      // while a style control is being changed.
      if (!(target instanceof Textbox) || !target.isEditing) textSelectionRanges.clear();
    });
    const commitShapeMediaResize = ({ target }: { target?: FabricObject }) => {
      const start = mediaResizeStartRef.current;
      if (!target || !start || target !== start.target || target !== mediaEditTargetRef.current || !(target.fill instanceof Pattern)) return;
      const scaleX = Math.abs(target.scaleX / (start.scaleX || 1));
      const scaleY = Math.abs(target.scaleY / (start.scaleY || 1));
      const scale = Math.max(0.1, (scaleX + scaleY) / 2);
      if (Math.abs(scale - 1) >= 0.001) {
        target.set({
          studioShapeFillScale: Math.max(10, Math.min(400, start.mediaScale * scale)),
          scaleX: start.scaleX,
          scaleY: start.scaleY,
        });
        refreshShapeMediaPattern(target);
        target.setCoords();
        canvas.requestRenderAll();
        emitDocumentChangeRef.current();
      }
      mediaResizeStartRef.current = null;
    };
    canvas.on("object:modified", commitShapeMediaResize);
    const syncTextboxBoxHeight = ({ target }: { target?: FabricObject }) => {
      if (!(target instanceof Textbox)) return;
      target.studioBoxHeight = target.height;
      target.dirty = true;
      const remembered = target.studioId ? textSelectionRanges.get(target.studioId) : undefined;
      const range = target.isEditing && target.selectionEnd > target.selectionStart
        ? { start: target.selectionStart, end: target.selectionEnd }
        : remembered ?? { start: 0, end: target.text.length };
      applyAutoSize(target, target.autoSize ?? "None", range);
      target.setCoords();
    };
    canvas.on("object:resizing", syncTextboxBoxHeight);
    const updateGuides = ({ target }: { target?: FabricObject }) => {
      if (!target) return;
      const zoom = canvas.getZoom() || 1;
      const snap = 8;
      const verticalTargets = [0, documentRef.current.width / 2, documentRef.current.width];
      const horizontalTargets = [0, documentRef.current.height / 2, documentRef.current.height];
      const objects = canvas.getObjects().filter((object) => object !== target && object.visible);
      for (const object of objects) {
        const width = object.getScaledWidth();
        const height = object.getScaledHeight();
        verticalTargets.push(object.left, object.left + width / 2, object.left + width);
        horizontalTargets.push(object.top, object.top + height / 2, object.top + height);
      }
      const width = target.getScaledWidth();
      const height = target.getScaledHeight();
      const xValues = [target.left, target.left + width / 2, target.left + width];
      const yValues = [target.top, target.top + height / 2, target.top + height];
      const nearest = (values: number[], lines: number[]) => {
        let best: { delta: number; line: number } | null = null;
        for (const value of values) for (const line of lines) {
          const delta = line - value;
          if (Math.abs(delta) * zoom <= snap && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, line };
        }
        return best;
      };
      const xSnap = nearest(xValues, verticalTargets);
      const ySnap = nearest(yValues, horizontalTargets);
      if (xSnap) target.set({ left: target.left + xSnap.delta });
      if (ySnap) target.set({ top: target.top + ySnap.delta });
      const nextXValues = [target.left, target.left + width / 2, target.left + width];
      const nextYValues = [target.top, target.top + height / 2, target.top + height];
      const vertical = verticalTargets.filter((line) => nextXValues.some((value) => Math.abs(value - line) * zoom <= snap));
      const horizontal = horizontalTargets.filter((line) => nextYValues.some((value) => Math.abs(value - line) * zoom <= snap));
      setGuides({ vertical: [...new Set(vertical)], horizontal: [...new Set(horizontal)] });
    };
    const clearGuides = () => setGuides({ vertical: [], horizontal: [] });
    canvas.on("object:moving", updateGuides);
    canvas.on("object:scaling", updateGuides);
    canvas.on("object:rotating", updateGuides);
    canvas.on("object:modified", clearGuides);
    canvas.on("selection:cleared", clearGuides);

    return () => {
      shapeMediaVideos.forEach((video) => {
        video.pause();
        video.src = "";
      });
      shapeMediaVideos.clear();
      canvas.dispose();
      canvasRef.current = null;
      textSelectionRanges.clear();
      mediaEditTargetRef.current = null;
      mediaResizeStartRef.current = null;
      undoRef.current = async () => undefined;
      redoRef.current = async () => undefined;
      emitDocumentChangeRef.current = () => undefined;
      callbacksRef.current.onTextSelectionChange(null);
      setGuides({ vertical: [], horizontal: [] });
    };
  }, []);

  // Fit the document's fixed pixel size into the available editor viewport.
  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;

    const fit = () => {
      const bounds = stage.getBoundingClientRect();
      const availableWidth = Math.max(0, bounds.width - 48);
      const availableHeight = Math.max(0, bounds.height - 48);
      if (availableWidth <= 0 || availableHeight <= 0) return;
      const scale = Math.min(availableWidth / document.width, availableHeight / document.height);
      canvas.setDimensions({ width: Math.floor(document.width * scale), height: Math.floor(document.height * scale) });
      canvas.setZoom(scale);
      canvas.requestRenderAll();
      setCanvasReady(true);
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [document.width, document.height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.backgroundColor = document.backgroundMode === "color" || !document.backgroundMode
      ? document.background
      : "";
    canvas.requestRenderAll();
  }, [document.background, document.backgroundMode]);

  // Load the document's serialized objects — Fabric's own restore path, not a hand-rolled mapper.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    shapeMediaVideosRef.current.forEach((video) => {
      video.pause();
      video.src = "";
    });
    shapeMediaVideosRef.current.clear();
    void canvas
      .loadFromJSON({ objects: document.objects, background: document.background })
      .then(() => {
        if (cancelled) return;
        canvas.getObjects().forEach((object) => {
          if (object instanceof Textbox) configureStudioTextbox(object, object.studioBoxHeight ?? object.height);
        });
        void hydrateShapeMedia(canvas, shapeMediaVideosRef.current, () => emitDocumentChangeRef.current());
        canvas.requestRenderAll();
        historyPastRef.current = [];
        historyFutureRef.current = [];
        lastSnapshotRef.current = canvasSnapshot(canvas, documentRef.current);
        callbacksRef.current.onHistoryChange({ canUndo: false, canRedo: false });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // A stale/unsupported persisted Fabric object should not take down
        // the entire application. Keep the canvas usable with the objects
        // that can be restored and expose the failure in the console for
        // diagnosis.
        console.error("Failed to restore template canvas", error);
        canvas.clear();
        canvas.backgroundColor = document.background;
        canvas.requestRenderAll();
        historyPastRef.current = [];
        historyFutureRef.current = [];
        lastSnapshotRef.current = canvasSnapshot(canvas, documentRef.current);
        callbacksRef.current.onHistoryChange({ canUndo: false, canRedo: false });
        callbacksRef.current.onDocumentChange({ objects: [], updatedAt: Date.now() });
      });
    return () => {
      cancelled = true;
    };
    // Intentionally reload only when switching to a different document, not on every local edit
    // (local edits already mutate the live canvas and are echoed back via onDocumentChange).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document.id]);

  useImperativeHandle(
    handleRef,
    () => ({
      addText: (box) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const textbox = new Textbox("Type here", {
          left: box.x,
          top: box.y,
          width: Math.max(40, box.width),
          centeredScaling: false,
        });
        configureStudioTextbox(textbox, box.height);
        textbox.studioId = nextStudioId("text");
        textbox.studioRole = "layer";
        textbox.studioName = nextStudioName(canvas, "Text");
        canvas.add(textbox);
        canvas.setActiveObject(textbox);
        canvas.requestRenderAll();
        emitDocumentChangeRef.current();
      },
      addShape: (kind, box) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const shape = shapeFactory(kind, Math.max(10, box.width), Math.max(10, box.height));
        shape.set({ left: box.x, top: box.y });
        shape.studioId = nextStudioId("shape");
        shape.studioRole = "layer";
        shape.studioName = nextStudioName(canvas, kind[0].toUpperCase() + kind.slice(1));
        canvas.add(shape);
        canvas.setActiveObject(shape);
        canvas.requestRenderAll();
        emitDocumentChangeRef.current();
      },
      addImage: async (source, name = "Image", mediaType = "image") => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const previewSource = mediaType === "video" ? await videoFrameSource(source) : source;
        let image: FabricImage;
        try {
          // Sources here are always local (data: URIs from the file picker or a
          // captured video frame) — requesting anonymous CORS on them serves no
          // purpose and can taint the image in stricter webviews, breaking later
          // canvas.toObject() serialization used to sync state back to React.
          image = previewSource
            ? await FabricImage.fromURL(previewSource)
            : new FabricImage(shapeMediaFallbackPreview("#101319"));
        } catch (error) {
          if (mediaType !== "video") throw error;
          image = new FabricImage(shapeMediaFallbackPreview("#101319"));
        }
        if (!canvasRef.current) return;
        const maxWidth = documentRef.current.width * 0.6;
        const maxHeight = documentRef.current.height * 0.6;
        const naturalWidth = image.width || maxWidth;
        const naturalHeight = image.height || maxHeight;
        const scale = Math.min(1, maxWidth / naturalWidth, maxHeight / naturalHeight);
        const width = Math.max(10, naturalWidth * scale);
        const height = Math.max(10, naturalHeight * scale);
        // Media add-ons are rectangles with an image-pattern fill, not bare Fabric images —
        // this gives them the same transform/fill/stroke/shadow settings as any other shape.
        const shape = new Rect({
          left: (documentRef.current.width - width) / 2,
          top: (documentRef.current.height - height) / 2,
          width,
          height,
          fill: "#101319",
          stroke: "",
          strokeWidth: 0,
          rx: 0,
          ry: 0,
        });
        shape.studioShapeKind = "rectangle";
        shape.set({
          fill: shapeMediaPattern(shape, image.getElement(), "cover", 100, 0, 0),
          studioShapeFillFit: "cover",
          studioShapeFillScale: 100,
          studioShapeFillX: 0,
          studioShapeFillY: 0,
          studioShapeFillOpacity: 1,
          studioShapeFillMediaType: mediaType,
          studioShapeFillMediaSource: source,
          studioIsMediaAddon: true,
          studioId: nextStudioId("image"),
          studioRole: "layer",
          studioName: nextStudioName(canvas, name),
        });
        canvas.add(shape);
        canvas.setActiveObject(shape);
        canvas.requestRenderAll();
        emitDocumentChangeRef.current();
      },
      setShapeMedia: async (studioId, source, name = "Shape media", mediaType = "image") => {
        const canvas = canvasRef.current;
        const object = canvas && findByStudioId(canvas, studioId);
        if (!canvas || !object || !isShapeObject(object)) return;

        if (!source) {
          const existingVideo = shapeMediaVideosRef.current.get(studioId);
          existingVideo?.pause();
          existingVideo?.removeAttribute("src");
          shapeMediaVideosRef.current.delete(studioId);
          const fallback = object.studioShapeFillColor ?? (typeof object.fill === "string" ? object.fill : "#101319");
          object.set({
            fill: fallback,
            studioShapeFillFit: undefined,
            studioShapeFillScale: undefined,
            studioShapeFillX: undefined,
            studioShapeFillY: undefined,
            studioShapeFillOpacity: undefined,
            studioShapeFillMediaType: undefined,
            studioShapeFillMediaSource: undefined,
          });
          canvas.requestRenderAll();
          emitDocumentChangeRef.current();
          return;
        }

        const fallbackColor = typeof object.fill === "string" ? object.fill : object.studioShapeFillColor ?? "#101319";
        // Apply the fill metadata and a neutral placeholder immediately, synchronously, so the
        // inspector panel reflects "media attached" right away regardless of whether the actual
        // image/video frame can be decoded — decoding failures (bad codec, slow load, etc.) must
        // never block the settings state, only the visual preview.
        object.set({
          fill: shapeMediaPattern(object, shapeMediaFallbackPreview(fallbackColor), "cover", 100, 0, 0),
          studioShapeFillFit: "cover",
          studioShapeFillScale: 100,
          studioShapeFillX: 0,
          studioShapeFillY: 0,
          studioShapeFillOpacity: 1,
          studioShapeFillColor: fallbackColor,
          studioShapeFillMediaType: mediaType,
          studioShapeFillMediaSource: source,
          studioName: object.studioName || name,
        });
        canvas.setActiveObject(object);
        canvas.requestRenderAll();
        emitDocumentChangeRef.current();

        try {
          if (mediaType === "video") {
            const video = shapeMediaVideo(source);
            const previousVideo = shapeMediaVideosRef.current.get(studioId);
            previousVideo?.pause();
            shapeMediaVideosRef.current.set(studioId, video);
            video.addEventListener("loadeddata", () => {
              if (!canvasRef.current || canvasRef.current !== canvas || !isShapeObject(object)) return;
              object.set("fill", shapeMediaPattern(
                object,
                video,
                object.studioShapeFillFit ?? "cover",
                object.studioShapeFillScale ?? 100,
                object.studioShapeFillX ?? 0,
                object.studioShapeFillY ?? 0,
              ));
              void video.play().catch(() => undefined);
              canvas.requestRenderAll();
              emitDocumentChangeRef.current();
            }, { once: true });
            video.addEventListener("timeupdate", () => canvas.requestRenderAll());
            video.load();
          } else {
            const image = await FabricImage.fromURL(source);
            if (!canvasRef.current || canvasRef.current !== canvas || !isShapeObject(object)) return;
            object.set("fill", shapeMediaPattern(
              object,
              image.getElement(),
              object.studioShapeFillFit ?? "cover",
              object.studioShapeFillScale ?? 100,
              object.studioShapeFillX ?? 0,
              object.studioShapeFillY ?? 0,
            ));
            canvas.requestRenderAll();
            emitDocumentChangeRef.current();
          }
        } catch (error) {
          // Keep the neutral placeholder already applied above; the fill metadata still stands.
          console.error("Failed to render a media preview for the shape fill", error);
        }
      },
      copySelection: async () => {
        const canvas = canvasRef.current;
        if (!canvas) return false;
        const selectedObjects = canvas.getActiveObjects();
        if (selectedObjects.length === 0 || selectedObjects.some((object) => object instanceof Textbox && object.isEditing)) return false;
        clipboardRef.current = await Promise.all(selectedObjects.map((object) => object.clone()));
        pasteOffsetRef.current = 0;
        return true;
      },
      pasteSelection: async () => {
        const canvas = canvasRef.current;
        if (!canvas || clipboardRef.current.length === 0) return false;
        const offset = 24 + pasteOffsetRef.current * 12;
        const pastedObjects = await Promise.all(clipboardRef.current.map((object) => object.clone()));
        pastedObjects.forEach((object) => {
          const sourceName = object.studioName || "Layer";
          object.set({
            left: (object.left ?? 0) + offset,
            top: (object.top ?? 0) + offset,
            studioId: nextStudioId("layer"),
            studioRole: "layer",
            studioName: `${sourceName} Copy`,
          });
          object.setCoords();
          canvas.add(object);
        });
        pasteOffsetRef.current += 1;
        canvas.discardActiveObject();
        if (pastedObjects.length === 1) canvas.setActiveObject(pastedObjects[0]);
        canvas.requestRenderAll();
        emitDocumentChangeRef.current();
        return true;
      },
      groupSelection: () => {
        const canvas = canvasRef.current;
        const activeObject = canvas?.getActiveObject();
        if (!canvas || !(activeObject instanceof ActiveSelection) || activeObject.getObjects().length < 2) return false;
        const objects = [...activeObject.getObjects()];
        canvas.discardActiveObject();
        canvas.remove(...objects);
        const group = new Group(objects, {
          studioId: nextStudioId("group"),
          studioRole: "layer",
          studioName: nextStudioName(canvas, "Group"),
        });
        canvas.add(group);
        canvas.setActiveObject(group);
        canvas.requestRenderAll();
        emitDocumentChangeRef.current();
        return true;
      },
      ungroupSelection: () => {
        const canvas = canvasRef.current;
        const activeObject = canvas?.getActiveObject();
        if (!canvas || !(activeObject instanceof Group) || activeObject instanceof ActiveSelection) return false;
        const objects = activeObject.removeAll();
        canvas.remove(activeObject);
        objects.forEach((object) => canvas.add(object));
        const selection = new ActiveSelection(objects, { canvas });
        canvas.setActiveObject(selection);
        canvas.requestRenderAll();
        emitDocumentChangeRef.current();
        return true;
      },
      deleteSelection: () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.getActiveObjects().forEach((object) => canvas.remove(object));
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        emitDocumentChangeRef.current();
      },
      selectById: (studioId) => {
        const canvas = canvasRef.current;
        const object = canvas && findByStudioId(canvas, studioId);
        if (!canvas || !object) return;
        textSelectionRef.current.clear();
        callbacksRef.current.onTextSelectionChange(null);
        canvas.setActiveObject(object);
        canvas.requestRenderAll();
      },
      setVisible: (studioId, visible) => {
        const canvas = canvasRef.current;
        const object = canvas && findByStudioId(canvas, studioId);
        if (!canvas || !object) return;
        object.set({ visible });
        canvas.requestRenderAll();
        emitDocumentChangeRef.current();
      },
      setLocked: (studioId, locked) => {
        const canvas = canvasRef.current;
        const object = canvas && findByStudioId(canvas, studioId);
        if (!canvas || !object) return;
        object.set({
          studioLocked: locked,
          selectable: !locked,
          evented: !locked,
          lockMovementX: locked,
          lockMovementY: locked,
          lockRotation: locked,
          lockScalingX: locked,
          lockScalingY: locked,
        });
        if (locked && canvas.getActiveObject() === object) canvas.discardActiveObject();
        canvas.requestRenderAll();
        emitDocumentChangeRef.current();
      },
      toDocument: () => {
        const canvas = canvasRef.current;
        const current = documentRef.current;
        if (!canvas) return current;
        // Edits are serialized into lastSnapshotRef whenever Fabric changes.
        // Reusing that snapshot avoids a second full Pattern/source traversal
        // when Save is clicked, which was the visible pause in the studio.
        const snapshot = lastSnapshotRef.current ?? canvasSnapshot(canvas, current);
        return {
          ...current,
          // Background controls are kept in the React document patch; using
          // that value preserves a color change made immediately before Save.
          background: current.background,
          objects: snapshot.objects,
          updatedAt: Date.now(),
        };
      },
      updateObject: (studioId, props) => {
        const canvas = canvasRef.current;
        const object = canvas && findByStudioId(canvas, studioId);
        if (!canvas || !object) return;

        const selectionStyles = object instanceof Textbox ? selectionStylesFrom(props) : {};
        const activeObject = canvas.getActiveObject();
        const rememberedSelection = textSelectionRef.current.get(studioId);
        const liveSelection = object instanceof Textbox && object.isEditing && object.selectionEnd > object.selectionStart
          ? { start: object.selectionStart, end: object.selectionEnd }
          : undefined;
        const selection = liveSelection ?? rememberedSelection;
        const hasHighlightedText = object instanceof Textbox
          && activeObject === object
          && Boolean(selection && selection.end > selection.start);
        const requestedScript = normalizeStudioScript(props.studioScript);
        const hasScriptRequest = props.studioScript === "none" || props.studioScript === "superscript" || props.studioScript === "subscript";
        const requestedTextCase = normalizeStudioTextCase(props.studioTextCase);
        const hasTextCaseRequest = object instanceof Textbox && "studioTextCase" in props;

        if (hasHighlightedText && Object.keys(selectionStyles).length > 0) {
          object.setSelectionStyles(selectionStyles, selection!.start, selection!.end);
        }
        if (object instanceof Textbox && hasScriptRequest) {
          applyTextScript(object, requestedScript, hasHighlightedText ? selection! : scriptRange(object));
          if (!hasHighlightedText) {
            object.set({ studioScript: requestedScript });
          } else {
            const fullSelection = selection!.start === 0 && selection!.end >= object.text.length;
            object.set({ studioScript: fullSelection ? requestedScript : "none" });
          }
        }
        if (object instanceof Textbox && hasHighlightedText && "fontSize" in props) {
          updateScriptFontSize(object, selection!, Number(props.fontSize));
        }
        if (object instanceof Textbox && hasTextCaseRequest) {
          const range = hasHighlightedText ? selection! : scriptRange(object);
          const start = Math.max(0, Math.min(range.start, object.text.length));
          const end = Math.max(start, Math.min(range.end, object.text.length));
          const transformed = applyTextCase(object.text.slice(start, end), requestedTextCase);
          object.set({
            text: `${object.text.slice(0, start)}${transformed}${object.text.slice(end)}`,
            studioTextCase: requestedTextCase,
          });
          if (object.isEditing) {
            object.selectionStart = start;
            object.selectionEnd = start + transformed.length;
          }
          object.initDimensions();
        }

        // Container/paragraph properties still apply to the textbox itself.
        // Character styles above are removed from this object-level update so
        // unselected characters retain their existing formatting.
        const objectProps = { ...props };
        const isShape = isShapeObject(object);
        const hasShapeMedia = isShape && object.fill instanceof Pattern;
        if (hasShapeMedia && typeof props.fill === "string") {
          object.studioShapeFillColor = props.fill;
          delete objectProps.fill;
        }
        if (hasHighlightedText) for (const key of Object.keys(selectionStyles)) {
          delete objectProps[key];
        }
        if ("backgroundColor" in props && hasHighlightedText) delete objectProps.backgroundColor;
        if (hasScriptRequest) delete objectProps.studioScript;
        if (hasTextCaseRequest) delete objectProps.studioTextCase;
        if (object instanceof Textbox && !hasHighlightedText && "fontSize" in props && normalizeStudioScript(object.studioScript) !== "none") {
          updateScriptFontSize(object, scriptRange(object), Number(props.fontSize));
          delete objectProps.fontSize;
        }
        if (Object.keys(objectProps).length > 0) object.set(objectProps);
        if (isShape && hasShapeMedia && ("studioShapeFillFit" in props || "studioShapeFillScale" in props || "studioShapeFillX" in props || "studioShapeFillY" in props || "width" in props || "height" in props)) {
          refreshShapeMediaPattern(object);
        }
        if (object instanceof Polygon && (object.studioShapeKind === "polygon" || object.studioShapeKind === "star")) {
          const width = Math.max(10, object.width * object.scaleX);
          const height = Math.max(10, object.height * object.scaleY);
          if (object.studioShapeKind === "polygon" && "polygonSides" in props) {
            const polygonSides = Math.max(3, Math.min(12, Number(props.polygonSides) || 3));
            object.set({ polygonSides, points: radialPoints(polygonSides, Math.min(width, height) / 2) });
          }
          if (object.studioShapeKind === "star" && ("starPoints" in props || "starInnerRadius" in props)) {
            const starPoints = Math.max(3, Math.min(10, Number(props.starPoints ?? object.starPoints) || 5));
            const starInnerRadius = Math.max(0.08, Math.min(0.92, Number(props.starInnerRadius ?? object.starInnerRadius) || 0.44));
            object.set({ starPoints, starInnerRadius, points: radialPoints(starPoints * 2, Math.min(width, height) / 2, Math.min(width, height) * starInnerRadius / 2) });
          }
        }
        if (object instanceof Textbox && "autoSize" in props) {
          const requestedMode = props.autoSize;
          const mode: StudioAutoSize = requestedMode === "Grow to fit" || requestedMode === "Shrink to fit" ? requestedMode : "None";
          applyAutoSize(object, mode, hasHighlightedText ? selection! : { start: 0, end: object.text.length });
        }
        object.setCoords();
        canvas.requestRenderAll();
        if (hasHighlightedText && object instanceof Textbox) {
          callbacksRef.current.onTextSelectionChange({
            studioId,
            ...selection!,
            styles: selectionStyleSummary(object, selection!.start, selection!.end),
          });
        }
        emitDocumentChangeRef.current();
      },
      reorderObject: (studioId, direction) => {
        const canvas = canvasRef.current;
        const object = canvas && findByStudioId(canvas, studioId);
        if (!canvas || !object) return;
        if (direction === "front") canvas.bringObjectToFront(object);
        if (direction === "forward") canvas.bringObjectForward(object);
        if (direction === "backward") canvas.sendObjectBackwards(object);
        if (direction === "back") canvas.sendObjectToBack(object);
        canvas.requestRenderAll();
        emitDocumentChangeRef.current();
      },
      getCanvas: () => canvasRef.current,
      undo: () => undoRef.current(),
      redo: () => redoRef.current(),
      setBackground: (background) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.backgroundColor = background;
        canvas.requestRenderAll();
        emitDocumentChangeRef.current();
      },
      setBackgroundConfig: (config) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const background = config.mode === "color" ? (config.color ?? "") : "";
        const previous = lastSnapshotRef.current;
        const next = previous && { ...previous, background, backgroundMode: config.mode, backgroundMedia: config.media ?? null };
        if (previous && next && !snapshotsEqual(previous, next)) {
          historyPastRef.current.push(previous);
          historyFutureRef.current = [];
          callbacksRef.current.onHistoryChange({ canUndo: true, canRedo: false });
        }
        if (next) lastSnapshotRef.current = next;
        documentRef.current = { ...documentRef.current, background, backgroundMode: config.mode, backgroundMedia: config.media ?? null };
        canvas.backgroundColor = background;
        canvas.requestRenderAll();
        callbacksRef.current.onDocumentChange({
          background,
          backgroundMode: config.mode,
          backgroundColor: config.color,
          backgroundGradientStart: config.gradientStart,
          backgroundGradientEnd: config.gradientEnd,
          backgroundGradientAngle: config.gradientAngle,
          backgroundGradientStyle: config.gradientStyle,
          backgroundBlur: config.backgroundBlur,
          backgroundMedia: config.media,
          updatedAt: Date.now(),
        });
      },
      setCameraMedia: (cameraMedia) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const previous = lastSnapshotRef.current ?? canvasSnapshot(canvas, documentRef.current);
        const next = { ...previous, cameraMedia };
        if (!snapshotsEqual(previous, next)) {
          historyPastRef.current.push(previous);
          historyFutureRef.current = [];
          callbacksRef.current.onHistoryChange({ canUndo: true, canRedo: false });
        }
        lastSnapshotRef.current = next;
        documentRef.current = { ...documentRef.current, cameraMedia };
        callbacksRef.current.onDocumentChange({ cameraMedia, updatedAt: Date.now() });
      },
    }),
    [],
  );

  const beginCameraGesture = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    cameraGestureStartRef.current = lastSnapshotRef.current ?? canvasSnapshot(canvas, documentRef.current);
  };
  const changeCameraFrame = (media: TemplateBackgroundMedia | null) => {
    documentRef.current = { ...documentRef.current, cameraMedia: media };
    callbacksRef.current.onDocumentChange({ cameraMedia: media, updatedAt: Date.now() });
  };
  const endCameraGesture = () => {
    const start = cameraGestureStartRef.current;
    cameraGestureStartRef.current = null;
    if (!start) return;
    const next = { ...start, cameraMedia: documentRef.current.cameraMedia };
    if (snapshotsEqual(start, next)) return;
    historyPastRef.current.push(start);
    historyFutureRef.current = [];
    lastSnapshotRef.current = next;
    callbacksRef.current.onHistoryChange({ canUndo: true, canRedo: false });
  };
  const getCameraSnapTargets = () => {
    const current = documentRef.current;
    const targets = { vertical: [0, 50, 100], horizontal: [0, 50, 100] };
    for (const object of canvasRef.current?.getObjects() ?? []) {
      if (!object.visible) continue;
      const left = object.left / current.width * 100;
      const top = object.top / current.height * 100;
      const width = object.getScaledWidth() / current.width * 100;
      const height = object.getScaledHeight() / current.height * 100;
      targets.vertical.push(left, left + width / 2, left + width);
      targets.horizontal.push(top, top + height / 2, top + height);
    }
    return targets;
  };

  return (
    <div
      ref={stageRef}
      style={{
        boxSizing: "border-box",
        minHeight: 0,
        height: "100%",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background: "var(--bg-base)",
          overflow: "hidden",
          isolation: "isolate",
      }}
    >
      <div
        style={{
          position: "relative",
          lineHeight: 0,
          background: "transparent",
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 0,
            background: document.backgroundMode === "gradient"
              ? `linear-gradient(${document.backgroundGradientAngle ?? 135}deg, ${document.backgroundGradientStart || "#0f1117"}, ${document.backgroundGradientEnd || "#25204a"})`
              : document.backgroundMode === "media"
                ? "#0f1117"
                : document.background || "transparent",
            filter: document.backgroundBlur ? `blur(${document.backgroundBlur}px)` : undefined,
            transform: document.backgroundBlur ? "scale(1.04)" : undefined,
          }}
        />
        {/* Fabric mutates the canvas inside this host. Keeping that mutation
            below a React-owned wrapper prevents React from reconciling
            siblings against Fabric's relocated canvas node. */}
        <div ref={canvasHostRef} style={{ position: "relative", zIndex: 2, background: "transparent" }}>
          <canvas
            ref={canvasElementRef}
            style={{ display: "block", border: "1px solid var(--border-base)", boxShadow: "var(--shadow-md)" }}
          />
        </div>
        {canvasReady && document.backgroundMode === "media" && document.backgroundMedia && document.backgroundMedia.type !== "camera" && typeof document.backgroundMedia.src === "string" && document.backgroundMedia.src.length > 0 ? (
          <div style={{ position: "absolute", inset: 0, zIndex: 1, filter: document.backgroundBlur ? `blur(${document.backgroundBlur}px)` : undefined, transform: document.backgroundBlur ? "scale(1.04)" : undefined }}>
          {document.backgroundMedia.type === "video" ? (
            <ResilientVideo
              key={document.backgroundMedia.src}
              media={document.backgroundMedia}
              style={{ position: "absolute", inset: 0, zIndex: 1, width: "100%", height: "100%", objectFit: document.backgroundMedia.fit, opacity: document.backgroundMedia.opacity, mixBlendMode: document.backgroundMedia.blendMode as CSSProperties["mixBlendMode"], transform: `scale(${document.backgroundMedia.flipX ? -1 : 1}, ${document.backgroundMedia.flipY ? -1 : 1})`, filter: `hue-rotate(${document.backgroundMedia.hueRotate ?? 0}deg) invert(${document.backgroundMedia.invert ?? 0}%) blur(${document.backgroundMedia.blur ?? 0}px) grayscale(${document.backgroundMedia.grayscale ?? 0}%) sepia(${document.backgroundMedia.sepia ?? 0}%) brightness(${document.backgroundMedia.brightness ?? 100}%) contrast(${document.backgroundMedia.contrast ?? 100}%) saturate(${document.backgroundMedia.saturate ?? 100}%)`, clipPath: `inset(${document.backgroundMedia.cropTop ?? 0}% ${document.backgroundMedia.cropRight ?? 0}% ${document.backgroundMedia.cropBottom ?? 0}% ${document.backgroundMedia.cropLeft ?? 0}%)` }}
            />
          ) : (
            <img key={document.backgroundMedia.src} src={document.backgroundMedia.src} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} style={{ position: "absolute", inset: 0, zIndex: 1, width: "100%", height: "100%", objectFit: document.backgroundMedia.fit, opacity: document.backgroundMedia.opacity, mixBlendMode: document.backgroundMedia.blendMode as CSSProperties["mixBlendMode"], transform: `scale(${document.backgroundMedia.flipX ? -1 : 1}, ${document.backgroundMedia.flipY ? -1 : 1})`, filter: `hue-rotate(${document.backgroundMedia.hueRotate ?? 0}deg) invert(${document.backgroundMedia.invert ?? 0}%) blur(${document.backgroundMedia.blur ?? 0}px) grayscale(${document.backgroundMedia.grayscale ?? 0}%) sepia(${document.backgroundMedia.sepia ?? 0}%) brightness(${document.backgroundMedia.brightness ?? 100}%) contrast(${document.backgroundMedia.contrast ?? 100}%) saturate(${document.backgroundMedia.saturate ?? 100}%)`, clipPath: `inset(${document.backgroundMedia.cropTop ?? 0}% ${document.backgroundMedia.cropRight ?? 0}% ${document.backgroundMedia.cropBottom ?? 0}% ${document.backgroundMedia.cropLeft ?? 0}%)` }} />
           )}
          </div>
        ) : null}
        {canvasReady && document.cameraMedia?.type === "camera" ? (
          <div style={{ position: "absolute", inset: 0, zIndex: 1, overflow: "hidden" }}>
            <CameraViewport
              key={`${cameraSourceKey}:${cameraRetryToken}`}
              media={document.cameraMedia}
              onReady={() => setCameraError(null)}
              onError={(message) => setCameraError((current) => current?.source === cameraSourceKey && current.message === message ? current : { source: cameraSourceKey, message })}
              retryToken={cameraRetryToken}
              style={{ position: "absolute", left: `${document.cameraMedia.x}%`, top: `${document.cameraMedia.y}%`, width: `${document.cameraMedia.width}%`, height: `${document.cameraMedia.height}%`, opacity: document.cameraMedia.opacity, mixBlendMode: document.cameraMedia.blendMode as CSSProperties["mixBlendMode"] }}
            />
          </div>
        ) : null}
        {canvasReady && cameraEditMode !== "off" && document.cameraMedia?.type === "camera" ? (
          <CameraFrameControls
            media={document.cameraMedia}
            mode={cameraEditMode}
            getSnapTargets={getCameraSnapTargets}
            onStart={beginCameraGesture}
            onChange={changeCameraFrame}
            onGuides={(next) => setGuides({ vertical: next.vertical.map((position) => position / 100 * document.width), horizontal: next.horizontal.map((position) => position / 100 * document.height) })}
            onEnd={endCameraGesture}
          />
        ) : null}
        {document.cameraMedia?.type === "camera" && cameraError?.source === cameraSourceKey ? (
          <div role="alert" style={{ position: "absolute", zIndex: 5, top: 12, left: 12, maxWidth: "65%", padding: "8px 10px", borderRadius: 5, background: "rgba(20, 12, 16, 0.92)", color: "#ffb4b4", fontSize: 12, lineHeight: 1.4, display: "flex", alignItems: "center", gap: 8 }}>
            <span>Camera preview: {cameraError.message}</span>
            <button type="button" onClick={() => { setCameraError(null); setCameraRetryToken((value) => value + 1); }} style={{ border: "none", borderRadius: 4, background: "var(--color-primary)", color: "var(--fg-on-accent)", padding: "4px 7px", cursor: "pointer" }}>Retry</button>
          </div>
        ) : null}
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 5, pointerEvents: "none" }}>
          {guides.vertical.map((position) => (
            <div key={`v-${position}`} style={{ position: "absolute", top: 0, bottom: 0, left: `${position / document.width * 100}%`, width: 1, background: "var(--color-accent, #ff3d9a)", boxShadow: "0 0 5px rgba(255,61,154,.7)" }} />
          ))}
          {guides.horizontal.map((position) => (
            <div key={`h-${position}`} style={{ position: "absolute", left: 0, right: 0, top: `${position / document.height * 100}%`, height: 1, background: "var(--color-accent, #ff3d9a)", boxShadow: "0 0 5px rgba(255,61,154,.7)" }} />
          ))}
        </div>
      </div>
    </div>
  );
}
