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
import { Textbox, type Canvas, type FabricObject } from "fabric";

import { ResilientVideo } from "../ResilientVideo";
import { canvasSnapshot, configureStudioTextbox } from "./canvas/studioCanvasObjects";
import { createStudioCanvasHandle } from "./canvas/createStudioCanvasHandle";
import { setupStudioCanvas } from "./canvas/setupStudioCanvas";
import type { FabricStudioCanvasProps, StudioCanvasSnapshot } from "./canvas/studioCanvasTypes";

export type { StudioCanvasHandle, StudioShapeKind, StudioTextSelection } from "./canvas/studioCanvasTypes";

export function FabricStudioCanvas({ document, onSelectionChange, onTextSelectionChange, onDocumentChange, onHistoryChange, handleRef }: FabricStudioCanvasProps) {
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
    return setupStudioCanvas(element, { canvasRef, documentRef, callbacksRef, textSelectionRef, historyPastRef, historyFutureRef, lastSnapshotRef, restoringHistoryRef, historyOperationRef, undoRef, redoRef, emitDocumentChangeRef, shapeMediaVideosRef, mediaEditTargetRef, mediaResizeStartRef }, setGuides);
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
        canvas.requestRenderAll();
        historyPastRef.current = [];
        historyFutureRef.current = [];
        lastSnapshotRef.current = canvasSnapshot(canvas);
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
        lastSnapshotRef.current = canvasSnapshot(canvas);
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
    () => createStudioCanvasHandle({ clipboardRef, pasteOffsetRef, canvasRef, documentRef, callbacksRef, textSelectionRef, undoRef, redoRef, emitDocumentChangeRef, shapeMediaVideosRef }),
    [],
  );

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
        {canvasReady && document.backgroundMode === "media" && document.backgroundMedia && typeof document.backgroundMedia.src === "string" && document.backgroundMedia.src.length > 0 ? (
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
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 3, pointerEvents: "none" }}>
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
