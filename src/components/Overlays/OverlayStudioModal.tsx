import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import {
  createOverlayShapeElement, createOverlayWatermark, createOverlayWidget, getOverlayElements, overlayKindFromElements,
  type OverlayDefinition, type OverlayElement, type OverlayShapeKind, type OverlayWatermark, type OverlayWidget,
} from "../../types/overlays";
import { OverlayStage, OverlayVisual } from "./OverlayVisual";

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
type Geometry = Pick<OverlayElement, "x" | "y" | "width" | "height">;
type DragSession = { id: string; mode: "move" | "resize"; handle?: Handle; clientX: number; clientY: number; geometry: Geometry; stageWidth: number; stageHeight: number };

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}

function snap(value: number, targets: number[], threshold = 1.2) {
  const match = targets.find((target) => Math.abs(value - target) <= threshold);
  return match === undefined ? value : match;
}

function durationParts(total: number) {
  return { hours: Math.floor(total / 3600), minutes: Math.floor(total % 3600 / 60), seconds: total % 60 };
}

const controlStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", border: "none", borderRadius: 7,
  background: "var(--bg-elevated)", color: "var(--fg-base)", padding: "8px 9px", fontSize: 13,
};
const labelStyle: React.CSSProperties = { display: "grid", gap: 6, color: "var(--fg-muted)", fontSize: 12 };
const sectionStyle: React.CSSProperties = { fontSize: 11, letterSpacing: ".08em", color: "var(--fg-muted)" };

function OptionalColor({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label style={labelStyle}>
    {label}
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input aria-label={label} type="color" value={value || "#000000"} onChange={(event) => onChange(event.target.value)} style={{ ...controlStyle, width: 42, height: 32, padding: 2, cursor: "pointer" }} />
      <button type="button" aria-label={`No ${label.toLowerCase()}`} aria-pressed={!value} onClick={() => onChange("")} style={{ ...controlStyle, width: "auto", height: 32, padding: "0 10px", cursor: "pointer", color: !value ? "var(--color-primary)" : "var(--fg-muted)" }}>None</button>
    </span>
  </label>;
}
const handles: Array<{ id: Handle; x: string; y: string; cursor: string }> = [
  { id: "nw", x: "0%", y: "0%", cursor: "nwse-resize" }, { id: "n", x: "50%", y: "0%", cursor: "ns-resize" },
  { id: "ne", x: "100%", y: "0%", cursor: "nesw-resize" }, { id: "e", x: "100%", y: "50%", cursor: "ew-resize" },
  { id: "se", x: "100%", y: "100%", cursor: "nwse-resize" }, { id: "s", x: "50%", y: "100%", cursor: "ns-resize" },
  { id: "sw", x: "0%", y: "100%", cursor: "nesw-resize" }, { id: "w", x: "0%", y: "50%", cursor: "ew-resize" },
];

export function OverlayStudioModal({ initial, onSave, onClose }: {
  initial: OverlayDefinition;
  onSave: (overlay: OverlayDefinition) => boolean;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => ({ ...initial, elements: getOverlayElements(initial) }));
  const [selected, setSelected] = useState<string | null>(() => getOverlayElements(initial).at(-1)?.id ?? null);
  const [showGuides, setShowGuides] = useState(true);
  const [snapGuides, setSnapGuides] = useState({ vertical: false, horizontal: false });
  const [error, setError] = useState("");
  const [isImportingPng, setIsImportingPng] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const pngInputRef = useRef<HTMLInputElement>(null);
  const pngTargetRef = useRef<string | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  const elements = draft.elements ?? [];
  const selectedElement = elements.find((element) => element.id === selected) ?? null;
  const geometry: Geometry | null = selectedElement && { x: selectedElement.x, y: selectedElement.y, width: selectedElement.width, height: selectedElement.height };

  const patch = (values: Partial<OverlayDefinition>) => setDraft((current) => ({ ...current, ...values }));
  const patchElement = (id: string, values: Partial<OverlayElement>) => setDraft((current) => ({
    ...current,
    elements: (current.elements ?? []).map((element) => element.id === id ? { ...element, ...values } as OverlayElement : element),
  }));
  const addWidget = (type: OverlayWidget["type"]) => {
    const widget = createOverlayWidget(type, elements.filter((element) => element.type === type).length);
    patch({ elements: [...elements, widget] });
    setSelected(widget.id);
    setError("");
  };
  const addShape = (kind: OverlayShapeKind) => {
    const shape = createOverlayShapeElement(kind, elements.filter((element) => element.type === "shape").length);
    const selectedIndex = elements.findIndex((element) => element.id === selected);
    const insertAt = selectedIndex >= 0 && elements[selectedIndex].type !== "shape" ? selectedIndex : elements.length;
    patch({ elements: [...elements.slice(0, insertAt), shape, ...elements.slice(insertAt)] });
    setSelected(shape.id);
    setError("");
  };
  const addWatermark = () => {
    const watermark = createOverlayWatermark(elements.filter((element) => element.type === "watermark").length);
    patch({ elements: [...elements, watermark] });
    setSelected(watermark.id);
    setError("");
  };
  const choosePng = async (id: string) => {
    if (!("__TAURI_INTERNALS__" in window)) { pngTargetRef.current = id; pngInputRef.current?.click(); return; }
    try {
      const selected = await openDialog({ multiple: false, filters: [{ name: "PNG image", extensions: ["png"] }] });
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (!path) return;
      if (!/\.png$/i.test(path)) { setError("Choose a .png image for the watermark."); return; }
      setIsImportingPng(true);
      const src = await invoke<string>("import_overlay_png", { path });
      patchElement(id, { src });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open the PNG image.");
    } finally {
      setIsImportingPng(false);
    }
  };
  const loadPng = async (file: File, id: string) => {
    if (!/\.png$/i.test(file.name) || (file.type && file.type !== "image/png")) { setError("Choose a .png image for the watermark."); return; }
    if (file.size > 2 * 1024 * 1024) { setError("Use a PNG under 2 MB in the browser; the desktop app accepts larger files."); return; }
    setIsImportingPng(true);
    try {
      const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read the PNG image."));
        reader.readAsDataURL(file);
      });
      patchElement(id, { src });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read the PNG image.");
    } finally {
      setIsImportingPng(false);
    }
  };
  const removeLayer = (id: string) => {
    const next = elements.filter((element) => element.id !== id);
    patch({ elements: next });
    if (selected === id) setSelected(next.at(-1)?.id ?? null);
  };
  const removeSelected = () => { if (selected) removeLayer(selected); };
  const moveLayer = (id: string, direction: -1 | 1) => {
    const index = elements.findIndex((element) => element.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= elements.length) return;
    const next = [...elements];
    [next[index], next[target]] = [next[target], next[index]];
    patch({ elements: next });
  };
  const toggleLayerVisibility = (element: OverlayElement) => {
    const visible = element.visible === false;
    patchElement(element.id, { visible });
    if (!visible && selected === element.id) setSelected(null);
  };
  const setDurationPart = (widget: OverlayWidget, part: "hours" | "minutes" | "seconds", value: number) => {
    const next = { ...durationParts(widget.durationSeconds), [part]: clamp(Math.floor(value), 0, part === "hours" ? 99 : 59) };
    patchElement(widget.id, { durationSeconds: next.hours * 3600 + next.minutes * 60 + next.seconds });
  };
  const save = () => {
    if (isImportingPng) { setError("Wait for the PNG image to finish loading."); return; }
    if (!draft.name.trim()) { setError("Enter an overlay name."); return; }
    if (!elements.length) { setError("Add at least one element to the canvas."); return; }
    if (elements.some((element) => element.type === "timer" && element.durationSeconds < 1)) {
      setError("Set every countdown longer than zero."); return;
    }
    if (elements.some((element) => element.type === "timer" && !/\{time\}/i.test(element.text))) {
      setError("Timer text must include {time} to show the countdown."); return;
    }
    if (elements.some((element) => element.type === "watermark" && !element.src)) {
      setError("Choose a PNG image for every watermark."); return;
    }
    if (!onSave({ ...draft, name: draft.name.trim(), kind: overlayKindFromElements(elements), elements, updatedAt: Date.now() })) {
      setError("Could not save this overlay. Try a smaller PNG or free some local storage.");
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace" && event.key !== "Escape") return;
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "Escape") { setSelected(null); return; }
      if (!selected) return;
      event.preventDefault();
      const next = (draft.elements ?? []).filter((element) => element.id !== selected);
      setDraft((current) => ({ ...current, elements: next }));
      setSelected(next.at(-1)?.id ?? null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [draft.elements, selected]);

  const beginPointer = (id: string, mode: "move" | "resize", event: PointerEvent<HTMLDivElement>, handle?: Handle) => {
    event.stopPropagation();
    const bounds = stageRef.current?.getBoundingClientRect();
    const item = elements.find((element) => element.id === id);
    if (!item || item.visible === false) return;
    setSelected(id);
    if (!bounds?.width || !bounds.height) return;
    dragRef.current = { id, mode, handle, clientX: event.clientX, clientY: event.clientY, geometry: { x: item.x, y: item.y, width: item.width, height: item.height }, stageWidth: bounds.width, stageHeight: bounds.height };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const movePointer = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.clientX) / drag.stageWidth * 100;
    const dy = (event.clientY - drag.clientY) / drag.stageHeight * 100;
    const base = drag.geometry;
    if (drag.mode === "move") {
      let x = clamp(base.x + dx, 0, 100 - base.width);
      let y = clamp(base.y + dy, 0, 100 - base.height);
      const centerX = snap(x + base.width / 2, [33.333, 50, 66.667]);
      const centerY = snap(y + base.height / 2, [33.333, 50, 66.667]);
      x = snap(centerX - base.width / 2, [5, 95 - base.width]);
      y = snap(centerY - base.height / 2, [5, 95 - base.height]);
      setSnapGuides({ vertical: Math.abs(x + base.width / 2 - 50) < 0.1, horizontal: Math.abs(y + base.height / 2 - 50) < 0.1 });
      patchElement(drag.id, { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
      return;
    }
    const compact = elements.find((element) => element.id === drag.id)?.type === "shape" || elements.find((element) => element.id === drag.id)?.type === "watermark";
    const minWidth = compact ? 2 : 12;
    const minHeight = compact ? 2 : 7;
    const handle = drag.handle ?? "se";
    const originalRight = base.x + base.width;
    const originalBottom = base.y + base.height;
    const left = handle.includes("w") ? clamp(base.x + dx, 0, originalRight - minWidth) : base.x;
    const top = handle.includes("n") ? clamp(base.y + dy, 0, originalBottom - minHeight) : base.y;
    const right = handle.includes("e") ? clamp(originalRight + dx, left + minWidth, 100) : originalRight;
    const bottom = handle.includes("s") ? clamp(originalBottom + dy, top + minHeight, 100) : originalBottom;
    patchElement(drag.id, { x: Math.round(left * 10) / 10, y: Math.round(top * 10) / 10, width: Math.round((right - left) * 10) / 10, height: Math.round((bottom - top) * 10) / 10 });
  };
  const endPointer = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    setSnapGuides({ vertical: false, horizontal: false });
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  const updateGeometryField = (key: keyof Geometry, value: number) => {
    if (!selectedElement || !geometry) return;
    const min = key === "width" ? (selectedElement.type === "shape" || selectedElement.type === "watermark" ? 2 : 12) : key === "height" ? (selectedElement.type === "shape" || selectedElement.type === "watermark" ? 2 : 7) : 0;
    const max = key === "x" ? 100 - geometry.width : key === "y" ? 100 - geometry.height : key === "width" ? 100 - geometry.x : 100 - geometry.y;
    patchElement(selectedElement.id, { [key]: clamp(value, min, max) });
  };

  return createPortal(
    <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 1300, background: "var(--overlay-backdrop-strong)", display: "grid", placeItems: "center", padding: 18 }}>
      <section className="studio-modal" role="dialog" aria-modal="true" aria-label="Overlay Canvas Studio" style={{ width: "min(1480px, 97vw)", height: "min(900px, 95vh)", display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 12, background: "var(--bg-surface)", color: "var(--fg-base)", boxShadow: "var(--shadow-lg)" }}>
        <header style={{ padding: "12px 18px", borderBottom: "1px solid var(--border-base)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div><h2 style={{ margin: 0, fontSize: 16 }}>Overlay Canvas Studio</h2><span style={{ color: "var(--fg-muted)", fontSize: 11 }}>Build your overlay on a transparent 16:9 canvas</span></div>
          <button type="button" onClick={onClose} aria-label="Close overlay studio" style={{ ...controlStyle, width: 32, cursor: "pointer" }}>×</button>
        </header>
        <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "190px minmax(0, 1fr) 280px" }}>
          <aside className="studio-scroll-pane" style={{ padding: 14, borderRight: "1px solid var(--border-base)", overflowY: "auto", display: "grid", alignContent: "start", gap: 8 }}>
            <strong style={sectionStyle}>ADD FUNCTION</strong>
            <button type="button" onClick={() => addWidget("timer")} style={{ ...controlStyle, textAlign: "left", cursor: "pointer" }}>+ Add timer</button>
            <button type="button" onClick={() => addWidget("alert")} style={{ ...controlStyle, textAlign: "left", cursor: "pointer" }}>+ Add quick alert</button>
            <button type="button" onClick={() => addWidget("name")} style={{ ...controlStyle, textAlign: "left", cursor: "pointer" }}>+ Add name</button>
            <button type="button" onClick={addWatermark} style={{ ...controlStyle, textAlign: "left", cursor: "pointer" }}>+ Add watermark</button>
            <strong style={{ ...sectionStyle, marginTop: 13 }}>ADD SHAPE</strong>
            {(["rectangle", "ellipse", "triangle"] as OverlayShapeKind[]).map((kind) => <button key={kind} type="button" aria-label={`Add ${kind}`} onClick={() => addShape(kind)} style={{ ...controlStyle, textAlign: "left", cursor: "pointer" }}>+ {kind[0].toUpperCase() + kind.slice(1)}</button>)}
            <div style={{ marginTop: 13, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <strong style={sectionStyle}>LAYERS</strong>
              {selected ? <button type="button" aria-label="Deselect layer" onClick={() => setSelected(null)} style={{ border: 0, background: "transparent", color: "var(--fg-muted)", cursor: "pointer", fontSize: 11 }}>Clear</button> : null}
            </div>
            {elements.length ? [...elements].reverse().map((element) => {
              const index = elements.findIndex((entry) => entry.id === element.id);
              const active = selected === element.id;
              const visible = element.visible !== false;
              return <div key={element.id} data-overlay-layer={element.id} style={{ padding: 5, border: `1px solid ${active ? "var(--color-primary)" : "var(--border-base)"}`, borderRadius: 7, background: active ? "var(--color-primary-muted)" : "var(--bg-elevated)", opacity: visible ? 1 : 0.6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <button type="button" aria-label={`${active ? "Deselect" : "Select"} ${element.name}`} aria-pressed={active} onClick={() => setSelected(active ? null : element.id)} style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "5px 3px", border: 0, background: "transparent", color: active ? "var(--color-primary)" : "var(--fg-base)", textAlign: "left", fontSize: 12, fontWeight: active ? 700 : 500, cursor: "pointer" }}>{element.name}</button>
                  <button type="button" aria-label={`${visible ? "Hide" : "Show"} ${element.name}`} title={visible ? "Hide layer" : "Show layer"} onClick={() => toggleLayerVisibility(element)} style={{ border: 0, background: "transparent", color: "var(--fg-muted)", cursor: "pointer", padding: 3 }}>{visible ? "◉" : "○"}</button>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 3, borderTop: "1px solid var(--border-base)", paddingTop: 4 }}>
                  <span style={{ color: "var(--fg-subtle)", fontSize: 10, textTransform: "uppercase" }}>{element.type === "shape" ? element.kind : element.type}</span>
                  <span style={{ display: "flex", gap: 3 }}>
                    <button type="button" aria-label={`Bring ${element.name} forward`} title="Bring forward" disabled={index === elements.length - 1} onClick={() => moveLayer(element.id, 1)} style={{ border: 0, background: "transparent", color: "var(--fg-muted)", cursor: index === elements.length - 1 ? "default" : "pointer" }}>↑</button>
                    <button type="button" aria-label={`Send ${element.name} back`} title="Send back" disabled={index === 0} onClick={() => moveLayer(element.id, -1)} style={{ border: 0, background: "transparent", color: "var(--fg-muted)", cursor: index === 0 ? "default" : "pointer" }}>↓</button>
                    <button type="button" aria-label={`Delete ${element.name}`} title="Delete layer" onClick={() => removeLayer(element.id)} style={{ border: 0, background: "transparent", color: "var(--color-error)", cursor: "pointer" }}>×</button>
                  </span>
                </div>
              </div>;
            }) : <span style={{ color: "var(--fg-muted)", fontSize: 12 }}>Canvas is empty. Add a function or shape.</span>}
          </aside>
          <div style={{ minWidth: 0, minHeight: 0, padding: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: "var(--bg-base)" }}>
            <div style={{ width: "100%", maxWidth: 950, boxShadow: "var(--shadow-lg)", border: "1px solid var(--border-base)" }}>
              <OverlayStage stageRef={stageRef} onStagePointerDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }} background="repeating-conic-gradient(#24242b 0% 25%, #19191f 0% 50%) 50% / 32px 32px">
                {showGuides ? <div aria-hidden="true" data-overlay-guides="" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                  <div style={{ position: "absolute", inset: "5%", border: "2px dashed rgba(255,255,255,.18)" }} />
                  {[33.333, 66.667].map((value) => <div key={`v-${value}`} style={{ position: "absolute", left: `${value}%`, top: 0, bottom: 0, borderLeft: "1px dashed rgba(255,255,255,.14)" }} />)}
                  {[33.333, 66.667].map((value) => <div key={`h-${value}`} style={{ position: "absolute", top: `${value}%`, left: 0, right: 0, borderTop: "1px dashed rgba(255,255,255,.14)" }} />)}
                  <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, borderLeft: `${snapGuides.vertical ? 3 : 1}px ${snapGuides.vertical ? "solid" : "dashed"} ${snapGuides.vertical ? "#aa64ff" : "rgba(255,255,255,.35)"}` }} />
                  <div style={{ position: "absolute", top: "50%", left: 0, right: 0, borderTop: `${snapGuides.horizontal ? 3 : 1}px ${snapGuides.horizontal ? "solid" : "dashed"} ${snapGuides.horizontal ? "#aa64ff" : "rgba(255,255,255,.35)"}` }} />
                </div> : null}
                <OverlayVisual overlay={draft} onItemPointerDown={(id, event) => beginPointer(id, "move", event)} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer} />
                {selectedElement && selectedElement.visible !== false && geometry ? <div data-overlay-selection={selectedElement.id} style={{ position: "absolute", left: `${geometry.x}%`, top: `${geometry.y}%`, width: `${geometry.width}%`, height: `${geometry.height}%`, boxSizing: "border-box", border: "3px solid #b475ff", pointerEvents: "none" }}>
                  {handles.map((handle) => <div key={handle.id} role="button" tabIndex={0} aria-label={`Resize ${selectedElement.type} ${handle.id}`} onPointerDown={(event) => beginPointer(selectedElement.id, "resize", event, handle.id)} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer} style={{ position: "absolute", left: handle.x, top: handle.y, width: 24, height: 24, transform: "translate(-50%, -50%)", border: "3px solid #b475ff", borderRadius: 5, background: "white", boxSizing: "border-box", pointerEvents: "auto", cursor: handle.cursor, touchAction: "none" }} />)}
                </div> : null}
              </OverlayStage>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%", maxWidth: 950, alignItems: "center", gap: 10 }}>
              <span style={{ color: "var(--fg-muted)", fontSize: 11 }}>Drag layers or their handles. Click empty canvas to deselect. Guides help align them.</span>
              <button type="button" aria-pressed={showGuides} onClick={() => setShowGuides((value) => !value)} style={{ ...controlStyle, width: "auto", whiteSpace: "nowrap", cursor: "pointer" }}>{showGuides ? "Hide guides" : "Show guides"}</button>
            </div>
          </div>
          <aside className="studio-scroll-pane" style={{ padding: 14, borderLeft: "1px solid var(--border-base)", overflowY: "auto", display: "grid", alignContent: "start", gap: 15 }}>
            <strong style={sectionStyle}>OVERLAY OPTIONS</strong>
            <label style={labelStyle}>Overlay name<input aria-label="Overlay name" value={draft.name} onChange={(event) => patch({ name: event.target.value })} style={controlStyle} /></label>
            <input ref={pngInputRef} type="file" accept=".png,image/png" aria-label="Choose watermark PNG" onChange={(event) => { const file = event.target.files?.[0]; const id = pngTargetRef.current; event.target.value = ""; if (file && id) void loadPng(file, id); }} style={{ display: "none" }} />
            {selectedElement?.type === "watermark" ? <>
              <strong style={sectionStyle}>WATERMARK SETTINGS</strong>
              <label style={labelStyle}>Element name<input aria-label="Element name" value={selectedElement.name} onChange={(event) => patchElement(selectedElement.id, { name: event.target.value })} style={controlStyle} /></label>
              <button type="button" disabled={isImportingPng} onClick={() => void choosePng(selectedElement.id)} style={{ ...controlStyle, cursor: isImportingPng ? "wait" : "pointer" }}>{isImportingPng ? "Importing PNG…" : selectedElement.src ? "Replace PNG" : "Choose PNG"}</button>
              <span style={{ color: "var(--fg-muted)", fontSize: 11, overflowWrap: "anywhere" }}>{selectedElement.src ? selectedElement.src.startsWith("data:") ? "PNG selected" : selectedElement.src.split(/[\\/]/).pop()?.slice(0, 80) || "PNG selected" : "Transparent PNG images keep their alpha channel on LIVE output."}</span>
              <label style={labelStyle}>Fit<select aria-label="Watermark fit" value={selectedElement.fit} onChange={(event) => patchElement(selectedElement.id, { fit: event.target.value as OverlayWatermark["fit"] })} style={controlStyle}><option value="contain">Contain</option><option value="cover">Cover</option><option value="fill">Fill</option></select></label>
              <label style={labelStyle}>Opacity<input aria-label="Watermark opacity" type="range" min={0.05} max={1} step={0.05} value={selectedElement.opacity} onChange={(event) => patchElement(selectedElement.id, { opacity: Number(event.target.value) })} /></label>
              <label style={labelStyle}>Rotation °<input aria-label="Watermark rotation" type="number" min={-180} max={180} value={selectedElement.rotation} onChange={(event) => patchElement(selectedElement.id, { rotation: clamp(Number(event.target.value), -180, 180) })} style={controlStyle} /></label>
            </> : selectedElement?.type === "shape" ? <>
              <strong style={sectionStyle}>SHAPE SETTINGS</strong>
              <label style={labelStyle}>Element name<input aria-label="Element name" value={selectedElement.name} onChange={(event) => patchElement(selectedElement.id, { name: event.target.value })} style={controlStyle} /></label>
              <label style={labelStyle}>Shape<select aria-label="Shape kind" value={selectedElement.kind} onChange={(event) => patchElement(selectedElement.id, { kind: event.target.value as OverlayShapeKind })} style={controlStyle}><option value="rectangle">Rectangle</option><option value="ellipse">Ellipse</option><option value="triangle">Triangle</option></select></label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
                <OptionalColor label="Shape fill" value={selectedElement.fill} onChange={(fill) => patchElement(selectedElement.id, { fill })} />
                <OptionalColor label="Shape border color" value={selectedElement.stroke} onChange={(stroke) => patchElement(selectedElement.id, { stroke })} />
              </div>
              <label style={labelStyle}>Border width<input aria-label="Shape border width" type="range" min={0} max={20} value={selectedElement.strokeWidth} onChange={(event) => patchElement(selectedElement.id, { strokeWidth: Number(event.target.value) })} /></label>
              <label style={labelStyle}>Opacity<input aria-label="Shape opacity" type="range" min={0.05} max={1} step={0.05} value={selectedElement.opacity} onChange={(event) => patchElement(selectedElement.id, { opacity: Number(event.target.value) })} /></label>
              {selectedElement.kind === "rectangle" ? <label style={labelStyle}>Corner radius<input aria-label="Shape corner radius" type="range" min={0} max={100} value={selectedElement.radius} onChange={(event) => patchElement(selectedElement.id, { radius: Number(event.target.value) })} /></label> : null}
              <label style={labelStyle}>Rotation °<input aria-label="Shape rotation" type="number" min={-180} max={180} value={selectedElement.rotation} onChange={(event) => patchElement(selectedElement.id, { rotation: clamp(Number(event.target.value), -180, 180) })} style={controlStyle} /></label>
            </> : selectedElement ? <>
              <strong style={sectionStyle}>{selectedElement.type === "timer" ? "TIMER SETTINGS" : selectedElement.type === "name" ? "NAME SETTINGS" : "QUICK ALERT SETTINGS"}</strong>
              <label style={labelStyle}>Element name<input aria-label="Element name" value={selectedElement.name} onChange={(event) => patchElement(selectedElement.id, { name: event.target.value })} style={controlStyle} /></label>
              {selectedElement.type === "name" ? <>
                <label style={labelStyle}>Name<input aria-label="Name" value={selectedElement.text} onChange={(event) => patchElement(selectedElement.id, { text: event.target.value })} style={controlStyle} /></label>
                <label style={labelStyle}>Speaker Title<input aria-label="Speaker Title" value={selectedElement.speakerTitle ?? ""} onChange={(event) => patchElement(selectedElement.id, { speakerTitle: event.target.value })} style={controlStyle} /></label>
              </> : <label style={labelStyle}>Text<textarea aria-label="Element text" rows={3} value={selectedElement.text} onChange={(event) => patchElement(selectedElement.id, { text: event.target.value })} style={{ ...controlStyle, resize: "vertical" }} /></label>}
              {selectedElement.type === "timer" ? <>
                <div style={{ color: "var(--fg-muted)", fontSize: 11 }}>Use {'{time}'} anywhere in the text to show the countdown.</div>
                <button type="button" onClick={() => patchElement(selectedElement.id, { text: selectedElement.text + "{time}" })} style={{ ...controlStyle, cursor: "pointer" }}>Insert {'{time}'}</button>
                <div style={{ display: "grid", gap: 7 }}><span style={{ color: "var(--fg-muted)", fontSize: 12 }}>Countdown length</span><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  {(["hours", "minutes", "seconds"] as const).map((part) => <label key={part} style={labelStyle}>{part[0].toUpperCase()}<input aria-label={`Countdown ${part}`} type="number" min={0} max={part === "hours" ? 99 : 59} value={durationParts(selectedElement.durationSeconds)[part]} onChange={(event) => setDurationPart(selectedElement, part, Number(event.target.value))} style={controlStyle} /></label>)}
                </div></div>
              </> : null}
              <label style={labelStyle}>Font size<input aria-label="Font size" type="number" min={12} max={240} value={selectedElement.fontSize} onChange={(event) => patchElement(selectedElement.id, { fontSize: clamp(Number(event.target.value), 12, 240) })} style={controlStyle} /></label>
              <label style={labelStyle}>Font weight<select aria-label="Font weight" value={selectedElement.fontWeight} onChange={(event) => patchElement(selectedElement.id, { fontWeight: Number(event.target.value) })} style={controlStyle}><option value={400}>Regular</option><option value={500}>Medium</option><option value={600}>Semibold</option><option value={700}>Bold</option><option value={800}>Extra bold</option></select></label>
              <label style={labelStyle}>Text alignment<select aria-label="Text alignment" value={selectedElement.textAlign} onChange={(event) => patchElement(selectedElement.id, { textAlign: event.target.value as OverlayWidget["textAlign"] })} style={controlStyle}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
              <label style={labelStyle}>Text color<input aria-label="Text color" type="color" value={selectedElement.color} onChange={(event) => patchElement(selectedElement.id, { color: event.target.value })} /></label>
              {selectedElement.type === "name" ? <>
                <label style={labelStyle}>Title font size<input aria-label="Title font size" type="number" min={12} max={240} value={selectedElement.titleFontSize ?? 32} onChange={(event) => patchElement(selectedElement.id, { titleFontSize: clamp(Number(event.target.value), 12, 240) })} style={controlStyle} /></label>
                <label style={labelStyle}>Title font weight<select aria-label="Title font weight" value={selectedElement.titleFontWeight ?? 500} onChange={(event) => patchElement(selectedElement.id, { titleFontWeight: Number(event.target.value) })} style={controlStyle}><option value={400}>Regular</option><option value={500}>Medium</option><option value={600}>Semibold</option><option value={700}>Bold</option><option value={800}>Extra bold</option></select></label>
                <label style={labelStyle}>Title color<input aria-label="Title color" type="color" value={selectedElement.titleColor ?? selectedElement.color} onChange={(event) => patchElement(selectedElement.id, { titleColor: event.target.value })} /></label>
              </> : null}
              <label style={labelStyle}><span><input aria-label="Show panel" type="checkbox" checked={selectedElement.showPanel} onChange={(event) => patchElement(selectedElement.id, { showPanel: event.target.checked })} /> Panel</span></label>
              {selectedElement.showPanel ? <OptionalColor label="Panel color" value={selectedElement.panelColor} onChange={(panelColor) => patchElement(selectedElement.id, { panelColor })} /> : null}
              <label style={labelStyle}><span><input aria-label="Show accent" type="checkbox" checked={selectedElement.showAccent} onChange={(event) => patchElement(selectedElement.id, { showAccent: event.target.checked })} /> Accent</span></label>
              {selectedElement.showAccent ? <label style={labelStyle}>Accent color<input aria-label="Accent color" type="color" value={selectedElement.accentColor} onChange={(event) => patchElement(selectedElement.id, { accentColor: event.target.value })} /></label> : null}
              <label style={labelStyle}>Opacity<input aria-label="Element opacity" type="range" min={0.05} max={1} step={0.05} value={selectedElement.opacity} onChange={(event) => patchElement(selectedElement.id, { opacity: Number(event.target.value) })} /></label>
              <label style={labelStyle}>Rotation °<input aria-label="Element rotation" type="number" min={-180} max={180} value={selectedElement.rotation} onChange={(event) => patchElement(selectedElement.id, { rotation: clamp(Number(event.target.value), -180, 180) })} style={controlStyle} /></label>
            </> : <span style={{ color: "var(--fg-muted)", fontSize: 12 }}>Add a timer, quick alert, name, watermark, or shape to start designing.</span>}
            {selectedElement && geometry ? <>
              <strong style={sectionStyle}>SIZE & POSITION</strong>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{(["x", "y", "width", "height"] as const).map((key) => <label key={key} style={labelStyle}>{key === "x" || key === "y" ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1)} %<input aria-label={`${key} position or size`} type="number" min={0} max={100} step={0.1} value={geometry[key]} onChange={(event) => updateGeometryField(key, Number(event.target.value))} style={controlStyle} /></label>)}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" disabled={elements.findIndex((element) => element.id === selected) === 0} onClick={() => { if (selected) moveLayer(selected, -1); }} style={{ ...controlStyle, cursor: "pointer" }}>Send back</button>
                <button type="button" disabled={elements.findIndex((element) => element.id === selected) === elements.length - 1} onClick={() => { if (selected) moveLayer(selected, 1); }} style={{ ...controlStyle, cursor: "pointer" }}>Bring forward</button>
              </div>
              <button type="button" onClick={removeSelected} style={{ ...controlStyle, cursor: "pointer", color: "var(--color-error)" }}>Delete element</button>
            </> : null}
          </aside>
        </div>
        <footer style={{ padding: "10px 16px", borderTop: "1px solid var(--border-base)", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 9 }}>
          {error ? <span role="alert" style={{ marginRight: "auto", color: "var(--color-error)", fontSize: 12 }}>{error}</span> : null}
          <button type="button" onClick={onClose} style={{ ...controlStyle, width: "auto", cursor: "pointer" }}>Cancel</button>
          <button type="button" onClick={save} style={{ border: 0, borderRadius: 7, background: "var(--color-primary)", color: "white", padding: "9px 14px", cursor: "pointer", fontWeight: 700 }}>Save Overlay</button>
        </footer>
      </section>
    </div>, document.body,
  );
}
