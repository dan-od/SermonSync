import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

import { getOverlayElements, type OverlayDefinition, type OverlayElement, type OverlayShape, type OverlayWatermark, type OverlayWidget } from "../../types/overlays";

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;

function timerLabel(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

interface InteractionProps {
  overlayId: string;
  onItemPointerDown?: (id: string, event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove?: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerCancel?: (event: PointerEvent<HTMLDivElement>) => void;
}

function ShapeVisual({ shape, overlayId, onItemPointerDown, onPointerMove, onPointerUp, onPointerCancel }: InteractionProps & { shape: OverlayShape }) {
  return (
    <div
      data-overlay-id={overlayId}
      data-overlay-shape-id={shape.id}
      onPointerDown={onItemPointerDown ? (event) => onItemPointerDown(shape.id, event) : undefined}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      style={{ position: "absolute", left: `${shape.x}%`, top: `${shape.y}%`, width: `${shape.width}%`, height: `${shape.height}%`, boxSizing: "border-box", opacity: shape.opacity, transform: `rotate(${shape.rotation}deg)`, cursor: onItemPointerDown ? "grab" : "default", touchAction: "none", userSelect: "none" }}
    >
      {shape.kind === "triangle" ? (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true"><polygon points="50,2 98,98 2,98" fill={shape.fill || "none"} stroke={shape.stroke || "none"} strokeWidth={shape.strokeWidth / 2} /></svg>
      ) : (
        <div style={{ width: "100%", height: "100%", boxSizing: "border-box", background: shape.fill || "transparent", border: shape.strokeWidth > 0 && shape.stroke ? `${shape.strokeWidth}px solid ${shape.stroke}` : "none", borderRadius: shape.kind === "ellipse" ? "50%" : shape.radius }} />
      )}
    </div>
  );
}

function WidgetVisual({ widget, startedAt, overlayId, onItemPointerDown, onPointerMove, onPointerUp, onPointerCancel }: InteractionProps & { widget: OverlayWidget; startedAt?: number }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (widget.type !== "timer" || startedAt === undefined) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [widget.type, startedAt]);
  const remaining = Math.max(0, widget.durationSeconds - (startedAt === undefined ? 0 : Math.floor((now - startedAt) / 1000)));
  const timerIsBlinking = widget.type === "timer" && startedAt !== undefined && remaining <= 10;
  const content = widget.type === "timer" ? widget.text.replace(/\{time\}/gi, timerLabel(remaining)) : widget.text;

  return (
    <div
      data-overlay-id={overlayId}
      data-overlay-widget-id={widget.id}
      data-overlay-timer-blinking={timerIsBlinking ? "true" : undefined}
      onPointerDown={onItemPointerDown ? (event) => onItemPointerDown(widget.id, event) : undefined}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      style={{
        position: "absolute", left: `${widget.x}%`, top: `${widget.y}%`, width: `${widget.width}%`, height: `${widget.height}%`,
        boxSizing: "border-box", padding: widget.showPanel ? "14px 22px" : 0, borderRadius: widget.showPanel ? 20 : 0,
        background: widget.showPanel ? widget.panelColor || "transparent" : "transparent",
        borderLeft: widget.showAccent ? `10px solid ${widget.accentColor}` : "none",
        boxShadow: widget.showPanel ? "0 18px 55px rgba(0,0,0,.36)" : "none",
        color: widget.color, opacity: widget.opacity, transform: `rotate(${widget.rotation}deg)`,
        fontFamily: "Inter, system-ui, sans-serif", fontSize: widget.fontSize, fontWeight: widget.fontWeight,
        lineHeight: 1.12, textAlign: widget.textAlign, fontVariantNumeric: widget.type === "timer" ? "tabular-nums" : undefined,
        display: "flex", flexDirection: widget.type === "name" ? "column" : "row", alignItems: widget.type === "name" ? widget.textAlign === "center" ? "center" : widget.textAlign === "right" ? "flex-end" : "flex-start" : "center", justifyContent: widget.type === "name" ? "center" : widget.textAlign === "center" ? "center" : widget.textAlign === "right" ? "flex-end" : "flex-start",
        animation: timerIsBlinking ? "ssOverlayTimerBlink 800ms steps(2, end) infinite" : undefined,
        whiteSpace: "pre-wrap", overflowWrap: "anywhere", overflow: "hidden",
        cursor: onItemPointerDown ? "grab" : "default", touchAction: "none", userSelect: "none",
      }}
    >
      <span style={{ width: "100%" }}>{content}</span>
      {widget.type === "name" && widget.speakerTitle ? <span style={{ width: "100%", marginTop: 6, fontSize: widget.titleFontSize ?? 32, color: widget.titleColor ?? widget.color, fontWeight: widget.titleFontWeight ?? 500 }}>{widget.speakerTitle}</span> : null}
    </div>
  );
}

function WatermarkVisual({ watermark, overlayId, onItemPointerDown, onPointerMove, onPointerUp, onPointerCancel }: InteractionProps & { watermark: OverlayWatermark }) {
  let src = watermark.src;
  if (src && !/^(data:|blob:|https?:)/i.test(src)) {
    try { src = convertFileSrc(src); } catch { src = ""; }
  }
  return <div
    data-overlay-id={overlayId}
    data-overlay-watermark-id={watermark.id}
    onPointerDown={onItemPointerDown ? (event) => onItemPointerDown(watermark.id, event) : undefined}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    onPointerCancel={onPointerCancel}
    style={{ position: "absolute", left: `${watermark.x}%`, top: `${watermark.y}%`, width: `${watermark.width}%`, height: `${watermark.height}%`, opacity: watermark.opacity, transform: `rotate(${watermark.rotation}deg)`, cursor: onItemPointerDown ? "grab" : "default", touchAction: "none", userSelect: "none" }}
  >
    {src ? <img src={src} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: watermark.fit, pointerEvents: "none" }} /> : onItemPointerDown ? <div style={{ width: "100%", height: "100%", boxSizing: "border-box", border: "2px dashed #b475ff", display: "grid", placeItems: "center", color: "#d4b9ff", fontSize: 28 }}>PNG</div> : null}
  </div>;
}

export function OverlayVisual({ overlay, startedAt, onItemPointerDown, onPointerMove, onPointerUp, onPointerCancel }: {
  overlay: OverlayDefinition;
  startedAt?: number;
  onItemPointerDown?: (id: string, event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove?: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerCancel?: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  const interaction = { overlayId: overlay.id, onItemPointerDown, onPointerMove, onPointerUp, onPointerCancel };
  return <>
    {getOverlayElements(overlay).filter((element) => element.visible !== false).map((element: OverlayElement) => element.type === "shape"
      ? <ShapeVisual key={element.id} shape={element} {...interaction} />
      : element.type === "watermark"
        ? <WatermarkVisual key={element.id} watermark={element} {...interaction} />
        : <WidgetVisual key={element.id} widget={element} startedAt={startedAt} {...interaction} />)}
  </>;
}

export function OverlayStage({ children, background = "#000000", stageRef, onStagePointerDown }: {
  children: ReactNode;
  background?: string;
  stageRef?: React.RefObject<HTMLDivElement | null>;
  onStagePointerDown?: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const resize = () => {
      const width = container.getBoundingClientRect().width;
      if (width > 0) setScale(width / CANVAS_WIDTH);
    };
    resize();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    observer?.observe(container);
    window.addEventListener("resize", resize);
    return () => { observer?.disconnect(); window.removeEventListener("resize", resize); };
  }, []);

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", overflow: "hidden", background }}>
      <div ref={stageRef} data-overlay-stage="" onPointerDown={onStagePointerDown} style={{ position: "absolute", left: 0, top: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {children}
      </div>
    </div>
  );
}
