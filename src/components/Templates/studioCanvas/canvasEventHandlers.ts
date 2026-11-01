import { Pattern, Textbox, type FabricObject } from "fabric";
import { createStudioCanvas } from "../../../lib/fabricDefaults";
import { snapToGuides } from "./canvasHelpers";
import { isShapeObject, refreshShapeMediaPattern, hydrateShapeMedia } from "./shapeMedia";
import { canvasSnapshot, snapshotsEqual } from "./snapshot";
import { applyAutoSize, configureStudioTextbox, selectionStyleSummary } from "./textbox";
import type { StudioCanvasRefs, StudioCanvasSnapshot } from "./types";

/** Creates the Fabric canvas, wires its events, and returns the teardown. */
export function setupStudioCanvas(
  element: HTMLCanvasElement,
  { canvasRef, documentRef, callbacksRef, textSelectionRef, historyPastRef, historyFutureRef, lastSnapshotRef, restoringHistoryRef, historyOperationRef, undoRef, redoRef, emitDocumentChangeRef, shapeMediaVideosRef, mediaEditTargetRef, mediaResizeStartRef }: Omit<StudioCanvasRefs, "clipboardRef" | "pasteOffsetRef">,
  setGuides: (guides: { vertical: number[]; horizontal: number[] }) => void,
) {
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
      setGuides(snapToGuides(canvas, target, documentRef.current));
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
}
