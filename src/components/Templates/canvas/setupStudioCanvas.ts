/**
 * Canvas lifecycle: creates the single Fabric.Canvas instance, wires selection,
 * history and snapping listeners, and returns the teardown. Called once from
 * FabricStudioCanvas's mount effect.
 */
import { FabricObject, Pattern, Textbox } from "fabric";

import { createStudioCanvas } from "../../../lib/fabricDefaults";
import { canvasSnapshot, configureStudioTextbox, isShapeObject, snapshotsEqual } from "./studioCanvasObjects";
import { attachShapeMediaVideo, refreshShapeMediaPattern } from "./studioShapeMedia";
import { applyAutoSize, selectionStyleSummary } from "./studioTextFormatting";
import type { StudioCanvasSetupRefs, StudioCanvasSnapshot, StudioGuidesSetter } from "./studioCanvasTypes";

export function setupStudioCanvas(element: HTMLCanvasElement, refs: StudioCanvasSetupRefs, setGuides: StudioGuidesSetter): () => void {
  const { canvasRef, documentRef, callbacksRef, textSelectionRef, historyPastRef, historyFutureRef, lastSnapshotRef, restoringHistoryRef, historyOperationRef, undoRef, redoRef, emitDocumentChangeRef, shapeMediaVideosRef, mediaEditTargetRef, mediaResizeStartRef } = refs;
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
    const nextSnapshot = canvasSnapshot(canvas);
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
      await canvas.loadFromJSON({ objects: snapshot.objects, background: snapshot.background });
      canvas.getObjects().forEach((object) => {
        if (object instanceof Textbox) configureStudioTextbox(object, object.studioBoxHeight ?? object.height);
        if (object.studioShapeFillMediaType === "video" && typeof object.studioShapeFillMediaSource === "string") {
          attachShapeMediaVideo(canvas, object, object.studioShapeFillMediaSource, shapeMediaVideosRef.current, () => undefined);
        }
      });
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      lastSnapshotRef.current = canvasSnapshot(canvas);
      callbacksRef.current.onSelectionChange([]);
      callbacksRef.current.onTextSelectionChange(null);
      callbacksRef.current.onDocumentChange({ objects: lastSnapshotRef.current.objects, updatedAt: Date.now() });
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
}
