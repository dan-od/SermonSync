import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

import type { StudioFabricObjectData } from "../../types/studioDocument";
import type { StudioBackgroundMode } from "../../types/studioDocument";
import type { TemplateBackgroundMedia, TemplateShapeImageFit } from "../../types/templates";
import type { OverlayMode } from "../../types/state";
import { backendAvailable, listLocalCameras, type LocalCameraDevice } from "../../lib/cameraSources";
import { useCameraStore } from "../../stores/cameraStore";
import { importErrorMessage, importVideo } from "../../lib/videoImport";
import { Dropdown } from "../Settings/primitives";
import type { StudioTextSelection } from "./FabricStudioCanvas";
import type { CameraEditMode } from "../../lib/cameraFrame";

interface StudioLayersPanelProps {
  objects: StudioFabricObjectData[];
  selectedIds: string[];
  textSelection: StudioTextSelection | null;
  onSelect: (studioId: string) => void;
  onToggleVisibility: (studioId: string, visible: boolean) => void;
  onToggleLock: (studioId: string, locked: boolean) => void;
  onDelete: (studioId: string) => void;
  onUpdate: (studioId: string, props: Record<string, unknown>) => void;
  onSetShapeMedia?: (studioId: string, mediaType?: "image" | "video") => void;
  onClearShapeMedia?: (studioId: string) => void;
  onReorder: (studioId: string, direction: "front" | "forward" | "backward" | "back") => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  background: string;
  onBackgroundChange: (background: string) => void;
  backgroundMode: StudioBackgroundMode;
  backgroundColor: string;
  backgroundGradientStart: string;
  backgroundGradientEnd: string;
  backgroundGradientAngle: number;
  backgroundGradientStyle: "linear" | "radial" | "conic";
  backgroundBlur: number;
  backgroundMedia: TemplateBackgroundMedia | null;
  cameraEditMode: CameraEditMode;
  onCameraEditModeChange: (mode: CameraEditMode) => void;
  onBackgroundVideoStagingChange?: (staging: boolean) => void;
  onBackgroundConfigChange: (config: { mode: StudioBackgroundMode; color?: string; gradientStart?: string; gradientEnd?: string; gradientAngle?: number; gradientStyle?: "linear" | "radial" | "conic"; backgroundBlur?: number; media?: TemplateBackgroundMedia | null }) => void;
  screenLayout?: OverlayMode;
  onScreenLayoutChange?: (layout: OverlayMode) => void;
}

function layerLabel(object: StudioFabricObjectData, index: number): string {
  const name = typeof object.studioName === "string" ? object.studioName : undefined;
  if (name) return name;
  const type = typeof object.type === "string" ? object.type : "Object";
  return `${type} ${index + 1}`;
}

export function StudioLayersPanel({ objects, selectedIds, textSelection, onSelect, onToggleVisibility, onToggleLock, onDelete, onUpdate, onSetShapeMedia, onClearShapeMedia, onReorder, canUndo, canRedo, onUndo, onRedo, background, onBackgroundChange, backgroundMode, backgroundColor, backgroundGradientStart, backgroundGradientEnd, backgroundGradientAngle, backgroundGradientStyle, backgroundBlur, backgroundMedia, cameraEditMode, onCameraEditModeChange, onBackgroundConfigChange, onBackgroundVideoStagingChange, screenLayout, onScreenLayoutChange }: StudioLayersPanelProps) {
  // Fabric stacks objects back-to-front; the panel lists front-to-back like most design tools.
  const ordered = [...objects].map((object, index) => ({ object, index })).reverse();

  return (
    <div className="studio-scroll-pane" style={{ minHeight: 0, overflow: "auto", background: "var(--bg-surface)", borderLeft: "1px solid var(--border-base)" }}>
      {screenLayout && onScreenLayoutChange ? <div style={{ padding: "10px", borderBottom: "1px solid var(--border-base)" }}>
        <div style={sectionTitle}>Screen layout</div>
        <div style={labelStyle}><span>Projection layout</span><Dropdown value={screenLayout} options={[{ value: "widescreen", label: "Widescreen Slide" }, { value: "lower-third", label: "Lower Third" }, { value: "split-screen", label: "Split screen" }]} onChange={(layout) => onScreenLayoutChange(layout as OverlayMode)} triggerStyle={inputStyle} /></div>
      </div> : null}
      <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-base)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <span style={{ fontWeight: 700, fontSize: "12px", color: "var(--fg-base)" }}>Layers</span>
        <div style={{ display: "flex", gap: "3px" }}>
          <button type="button" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo" style={{ ...historyButton, opacity: canUndo ? 1 : 0.4 }}>↶</button>
          <button type="button" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+R)" aria-label="Redo" style={{ ...historyButton, opacity: canRedo ? 1 : 0.4 }}>↷</button>
        </div>
      </div>
      {ordered.length === 0 ? (
        <div style={{ padding: "24px 14px", color: "var(--fg-subtle)", fontSize: "12px" }}>
          No layers yet — use the + button to add text or a shape.
        </div>
      ) : (
        ordered.map(({ object, index }) => {
          const studioId = typeof object.studioId === "string" ? object.studioId : "";
          const visible = object.visible !== false;
          const locked = object.studioLocked === true;
          const active = studioId !== "" && selectedIds.includes(studioId);
          return (
            <div
              key={studioId || index}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
                padding: "7px 10px",
                borderBottom: "1px solid var(--border-base)",
                borderLeft: active ? "2px solid var(--color-primary)" : "2px solid transparent",
                background: active ? "var(--color-primary-muted)" : "transparent",
              }}
            >
              <button
                type="button"
                onClick={() => studioId && onSelect(studioId)}
                style={{
                  border: "none",
                  background: "transparent",
                  textAlign: "left",
                  cursor: "pointer",
                  color: active ? "var(--color-primary)" : "var(--fg-base)",
                  fontSize: "12px",
                  fontWeight: active ? 700 : 500,
                  padding: 0,
                  opacity: visible ? 1 : 0.5,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {layerLabel(object, index)}
              </button>
              <div style={{ display: "flex", gap: "2px", flexShrink: 0 }}>
                <button type="button" onClick={() => onReorder(studioId, "front")} style={iconBtn} title="Bring to front">⇈</button>
                <button type="button" onClick={() => onReorder(studioId, "forward")} style={iconBtn} title="Bring forward">↑</button>
                <button type="button" onClick={() => onReorder(studioId, "backward")} style={iconBtn} title="Send backward">↓</button>
                <button type="button" onClick={() => onReorder(studioId, "back")} style={iconBtn} title="Send to back">⇊</button>
                <button type="button" onClick={() => onToggleVisibility(studioId, !visible)} style={{ ...iconBtn, opacity: visible ? 1 : 0.4 }} title={visible ? "Hide" : "Show"}>
                  {visible ? "●" : "○"}
                </button>
                <button type="button" onClick={() => onToggleLock(studioId, !locked)} style={{ ...iconBtn, color: locked ? "var(--color-warning, #f5a623)" : "var(--fg-subtle)" }} title={locked ? "Locked — click to unlock" : "Click to lock"}>
                  {locked ? "⊠" : "⊞"}
                </button>
                <button type="button" onClick={() => onDelete(studioId)} style={{ ...iconBtn, color: "var(--color-error)" }} title="Delete">✕</button>
              </div>
            </div>
          );
        })
      )}
      {selectedIds.length === 1 ? (() => {
        const object = objects.find((entry) => entry.studioId === selectedIds[0]);
        if (!object || String(object.type).toLowerCase() !== "textbox") return null;
        const id = selectedIds[0];
        const set = (props: Record<string, unknown>) => onUpdate(id, props);
        const selectedStyles = textSelection?.studioId === id && textSelection.end > textSelection.start ? textSelection.styles : {};
        const value = (key: string, fallback = "") => {
          const styleKey = key === "backgroundColor" ? "textBackgroundColor" : key;
          return String(selectedStyles[styleKey] ?? object[key] ?? fallback);
        };
        const shadow = object.shadow && typeof object.shadow === "object" ? object.shadow as Record<string, unknown> : {};
        const setShadow = (patch: Partial<{ blur: number; offsetX: number; offsetY: number }>) => set({
          shadow: {
            color: typeof shadow.color === "string" ? shadow.color : "#000000",
            blur: typeof shadow.blur === "number" ? shadow.blur : 0,
            offsetX: typeof shadow.offsetX === "number" ? shadow.offsetX : 0,
            offsetY: typeof shadow.offsetY === "number" ? shadow.offsetY : 0,
            ...patch,
          },
        });
        const scriptMode = value("studioScript", "none");
        const styleIsActive = (key: string, activeValue: unknown) => {
          const current = selectedStyles[key] ?? object[key];
          return key === "fontWeight" ? Number(current) === Number(activeValue) : current === activeValue;
        };
        return <div style={{ padding: "10px", borderTop: "1px solid var(--border-base)" }}>
          <div style={sectionTitle}>Textbox</div>
          <InspectorSection title="Font settings"><div style={labelStyle}><span>Font family</span><Dropdown value={value("fontFamily", "Inter")} options={SYSTEM_FONTS.map((font) => ({ value: font, label: font }))} onChange={(fontFamily) => set({ fontFamily })} triggerStyle={inputStyle} minMenuWidth={220} /></div>
          <div style={twoColumn}><InspectorField label="Font size" type="number" value={value("fontSize", "28")} onChange={(v) => set({ fontSize: Math.max(6, Number(v) || 6) })} /><div style={labelStyle}><span>Auto size</span><Dropdown value={value("autoSize", "None")} options={["None", "Grow to fit", "Shrink to fit"].map((option) => ({ value: option, label: option }))} onChange={(autoSize) => set({ autoSize })} triggerStyle={inputStyle} /></div></div>
          <div style={buttonRow}>
            {[["Bold", "fontWeight", 700, 400], ["Italic", "fontStyle", "italic", "normal"], ["Underline", "underline", "underline", ""]].map(([label, key, on, off]) => <button key={String(label)} type="button" style={toggleStyle(styleIsActive(String(key), on))} onClick={() => set({ [key]: styleIsActive(String(key), on) ? off : on })}>{label}</button>)}
          </div>
          <div style={buttonRow}>
            <button type="button" title="Superscript" aria-label="Superscript" style={toggleStyle(scriptMode === "superscript")} onClick={() => set({ studioScript: scriptMode === "superscript" ? "none" : "superscript" })}>x<sup>2</sup></button>
            <button type="button" title="Subscript" aria-label="Subscript" style={toggleStyle(scriptMode === "subscript")} onClick={() => set({ studioScript: scriptMode === "subscript" ? "none" : "subscript" })}>x<sub>2</sub></button>
          </div>
          </InspectorSection><InspectorSection title="Align"><div style={iconButtonRow}>{[["left", "☰"], ["center", "≡"], ["right", "☷"], ["justify", "☰"]].map(([align, icon]) => <button key={align} type="button" title={align} aria-label={`Align ${align}`} onClick={() => set({ textAlign: align })} style={alignButtonStyle(value("textAlign", "left") === align)}>{icon}</button>)}</div><div style={verticalAlignRow}>{[["top", "↥"], ["center", "↕"], ["bottom", "↧"]].map(([verticalAlign, icon]) => <button key={verticalAlign} type="button" title={verticalAlign} aria-label={`Align ${verticalAlign}`} onClick={() => set({ verticalAlign })} style={verticalAlignButtonStyle(value("verticalAlign", "top") === verticalAlign)}>{icon}</button>)}</div></InspectorSection><InspectorSection title="Text">
          <div style={labelStyle}><span>Text case</span><Dropdown value={value("studioTextCase", "none")} options={[{ value: "none", label: "Keep as typed" }, { value: "uppercase", label: "UPPERCASE" }, { value: "lowercase", label: "lowercase" }, { value: "sentence", label: "Sentence case" }, { value: "title", label: "Title Case" }]} onChange={(studioTextCase) => set({ studioTextCase })} triggerStyle={inputStyle} minMenuWidth={160} /></div>
          <InspectorField label="Letter spacing" type="number" value={value("charSpacing", "0")} onChange={(v) => set({ charSpacing: Number(v) || 0 })} />
          <InspectorField label="Text color" type="color" value={value("fill", "#f4f7ff")} onChange={(v) => set({ fill: v })} />
          <InspectorField label="Background color" type="color" value={value("backgroundColor", "#000000")} onChange={(v) => set({ backgroundColor: v })} /></InspectorSection><InspectorSection title="Line"><div style={twoColumn}><InspectorField label="Line height" type="number" value={value("lineHeight", "1.16")} onChange={(v) => set({ lineHeight: Math.max(0.5, Number(v) || 0.5) })} /><InspectorField label="Line spacing" type="number" value={value("lineSpacing", "0")} onChange={(v) => set({ lineSpacing: Number(v) || 0 })} /></div><InspectorField label="Line background color" type="color" value={value("lineBackgroundColor", "#000000")} onChange={(v) => set({ lineBackgroundColor: v })} /></InspectorSection><InspectorSection title="Outline"><div style={twoColumn}><InspectorField label="Outline width" type="number" value={value("boxBorderWidth", "0")} onChange={(v) => set({ boxBorderWidth: Math.max(0, Number(v) || 0) })} /><InspectorField label="Corner radius" type="number" value={value("cornerRadius", "0")} onChange={(v) => set({ cornerRadius: Math.max(0, Number(v) || 0) })} /></div>
          <InspectorField label="Outline color" type="color" value={value("boxBorderColor", "#000000")} onChange={(v) => set({ boxBorderColor: v })} />
          </InspectorSection><InspectorSection title="Shadow"><InspectorField label="Shadow blur" type="number" value={String(shadow.blur ?? 0)} onChange={(v) => setShadow({ blur: Number(v) || 0 })} />
          <div style={twoColumn}><InspectorField label="Shadow offset X" type="number" value={String(shadow.offsetX ?? 0)} onChange={(v) => setShadow({ offsetX: Number(v) || 0 })} /><InspectorField label="Shadow offset Y" type="number" value={String(shadow.offsetY ?? 0)} onChange={(v) => setShadow({ offsetY: Number(v) || 0 })} /></div>
          </InspectorSection><InspectorSection title="Scrolling"><InspectorField label="Scrolling duration (s)" type="number" value={value("scrollDuration", "30")} onChange={(v) => set({ scrollDuration: Number(v) || 0 })} />
          <InspectorField label="Gap spacing" type="number" value={value("scrollGap", "100")} onChange={(v) => set({ scrollGap: Number(v) || 0 })} /></InspectorSection>
        </div>;
      })() : null}
      {selectedIds.length === 1 ? <ShapeInspector object={objects.find((entry) => entry.studioId === selectedIds[0])} onUpdate={(props) => onUpdate(selectedIds[0], props)} onSetMedia={(mediaType) => onSetShapeMedia?.(selectedIds[0], mediaType)} onClearMedia={() => onClearShapeMedia?.(selectedIds[0])} /> : null}
      <div style={{ padding: "10px", borderTop: "1px solid var(--border-base)" }}>
        <div style={sectionTitle}>Background</div>
        <div style={labelStyle}><span>Background type</span><Dropdown value={backgroundMode} options={["color", "gradient", "media"].map((mode) => ({ value: mode, label: mode[0].toUpperCase() + mode.slice(1) }))} onChange={(mode) => onBackgroundConfigChange({ mode: mode as StudioBackgroundMode, color: backgroundColor, gradientStart: backgroundGradientStart, gradientEnd: backgroundGradientEnd, gradientAngle: backgroundGradientAngle, gradientStyle: backgroundGradientStyle, backgroundBlur, media: backgroundMedia })} triggerStyle={inputStyle} /></div>
        {backgroundMode === "color" ? <InspectorField label="Background color" type="color" value={backgroundColor || background} onChange={(color) => { onBackgroundChange(color); onBackgroundConfigChange({ mode: "color", color, backgroundBlur }); }} /> : null}
        {backgroundMode === "gradient" ? <><div style={labelStyle}><span>Gradient style</span><Dropdown value={backgroundGradientStyle} options={[{ value: "linear", label: "Linear" }, { value: "radial", label: "Radial" }, { value: "conic", label: "Conic" }]} onChange={(style) => onBackgroundConfigChange({ mode: "gradient", gradientStart: backgroundGradientStart, gradientEnd: backgroundGradientEnd, gradientAngle: backgroundGradientAngle, gradientStyle: style as "linear" | "radial" | "conic", backgroundBlur })} triggerStyle={inputStyle} /></div><div style={twoColumn}><InspectorField label="Start color" type="color" value={backgroundGradientStart} onChange={(color) => onBackgroundConfigChange({ mode: "gradient", gradientStart: color, gradientEnd: backgroundGradientEnd, gradientAngle: backgroundGradientAngle, gradientStyle: backgroundGradientStyle, backgroundBlur })} /><InspectorField label="End color" type="color" value={backgroundGradientEnd} onChange={(color) => onBackgroundConfigChange({ mode: "gradient", gradientStart: backgroundGradientStart, gradientEnd: color, gradientAngle: backgroundGradientAngle, gradientStyle: backgroundGradientStyle, backgroundBlur })} /></div><InspectorField label="Angle (degrees)" type="number" value={String(backgroundGradientAngle)} onChange={(angle) => onBackgroundConfigChange({ mode: "gradient", gradientStart: backgroundGradientStart, gradientEnd: backgroundGradientEnd, gradientAngle: Number(angle) || 0, gradientStyle: backgroundGradientStyle, backgroundBlur })} /></> : null}
        {backgroundMode === "media" ? <MediaBackgroundControls media={backgroundMedia} onChange={(media) => onBackgroundConfigChange({ mode: "media", media, backgroundBlur })} onStagingChange={onBackgroundVideoStagingChange} cameraEditMode={cameraEditMode} onCameraEditModeChange={onCameraEditModeChange} /> : null}
        <InspectorField label="Background blur (px)" type="number" value={String(backgroundBlur)} onChange={(value) => onBackgroundConfigChange({ mode: backgroundMode, color: backgroundColor, gradientStart: backgroundGradientStart, gradientEnd: backgroundGradientEnd, gradientAngle: backgroundGradientAngle, gradientStyle: backgroundGradientStyle, backgroundBlur: Math.max(0, Math.min(100, Number(value) || 0)), media: backgroundMedia })} />
      </div>
    </div>
  );
}

function ShapeInspector({ object, onUpdate, onSetMedia, onClearMedia }: { object: StudioFabricObjectData | undefined; onUpdate: (props: Record<string, unknown>) => void; onSetMedia?: (mediaType?: "image" | "video") => void; onClearMedia?: () => void }) {
  const fabricType = String(object?.type ?? "").toLowerCase();
  const isShape = fabricType === "rect" || fabricType === "ellipse" || fabricType === "triangle" || fabricType === "line" || fabricType === "polygon";
  if (!object || !isShape) return null;

  const shapeKind = typeof object.studioShapeKind === "string" ? object.studioShapeKind : fabricType === "ellipse" ? "circle" : fabricType === "rect" ? "rectangle" : fabricType;
  const value = (key: string, fallback = "") => String(object[key] ?? fallback);
  const number = (key: string, fallback = 0) => typeof object[key] === "number" && Number.isFinite(object[key]) ? object[key] as number : fallback;
  const shadow = object.shadow && typeof object.shadow === "object" ? object.shadow as Record<string, unknown> : {};
  const fillObject = object.fill && typeof object.fill === "object" ? object.fill as Record<string, unknown> : null;
  const shapeMediaSource = typeof object.studioShapeFillMediaSource === "string"
    ? object.studioShapeFillMediaSource
    : fillObject?.type === "pattern" && typeof fillObject.source === "string" ? fillObject.source : null;
  const shapeMediaType = object.studioShapeFillMediaType === "video" ? "video" : "image";
  const shapeMediaFit = value("studioShapeFillFit", "cover") as TemplateShapeImageFit;
  const shapeMediaScale = number("studioShapeFillScale", 100);
  const shapeMediaX = number("studioShapeFillX", 0);
  const shapeMediaY = number("studioShapeFillY", 0);
  const shapeMediaOpacity = number("studioShapeFillOpacity", 1);
  const setShadow = (patch: Record<string, unknown>) => onUpdate({ shadow: { color: typeof shadow.color === "string" ? shadow.color : "#000000", blur: typeof shadow.blur === "number" ? shadow.blur : 0, offsetX: typeof shadow.offsetX === "number" ? shadow.offsetX : 0, offsetY: typeof shadow.offsetY === "number" ? shadow.offsetY : 0, ...patch } });
  const supportsRadius = shapeKind === "rectangle" || shapeKind === "square";
  const supportsStrokeStyle = shapeKind === "line" || shapeKind === "arrow";
  // A media add-on (from "Add media") is media through and through — it has no
  // meaningful "plain color fill" state, unlike a shape a user chose to fill with an image.
  const isMediaAddon = object.studioIsMediaAddon === true;
  const hasNoColorFill = object.fill == null || object.fill === "" || object.fill === "transparent";

  return <div style={{ padding: "10px", borderTop: "1px solid var(--border-base)" }}>
    <div style={sectionTitle}>{shapeMediaSource ? "Media" : `Shape: ${shapeKind}`}</div>
    <InspectorSection title="Transform">
      <div style={twoColumn}>
        <InspectorField label="X position" type="number" value={value("left", "0")} onChange={(next) => onUpdate({ left: Number(next) || 0 })} />
        <InspectorField label="Y position" type="number" value={value("top", "0")} onChange={(next) => onUpdate({ top: Number(next) || 0 })} />
        <InspectorField label="Width" type="number" value={value("width", "0")} onChange={(next) => onUpdate({ width: Math.max(1, Number(next) || 1) })} />
        <InspectorField label="Height" type="number" value={value("height", "0")} onChange={(next) => onUpdate({ height: Math.max(1, Number(next) || 1) })} />
        <InspectorField label="Rotation" type="number" value={value("angle", "0")} onChange={(next) => onUpdate({ angle: Number(next) || 0 })} />
        <InspectorField label="Opacity (%)" type="number" value={String(Math.round(number("opacity", 1) * 100))} onChange={(next) => onUpdate({ opacity: Math.max(0, Math.min(1, (Number(next) || 0) / 100)) })} />
      </div>
      <div style={buttonRow}>
        <button type="button" style={toggleStyle(object.flipX === true)} onClick={() => onUpdate({ flipX: object.flipX !== true })}>Flip horizontally</button>
        <button type="button" style={toggleStyle(object.flipY === true)} onClick={() => onUpdate({ flipY: object.flipY !== true })}>Flip vertically</button>
      </div>
    </InspectorSection>
    <InspectorSection title={isMediaAddon ? "Media" : "Fill"}>
      {!isMediaAddon ? (
        <div style={labelStyle}><span>Fill type</span><Dropdown value={shapeMediaSource ? shapeMediaType : hasNoColorFill ? "none" : "color"} options={[{ value: "none", label: "None" }, { value: "color", label: "Color" }, { value: "image", label: "Image" }, { value: "video", label: "Video" }]} onChange={(fillType) => {
          if (fillType === "image" || fillType === "video") onSetMedia?.(fillType);
          else if (fillType === "none") {
            if (shapeMediaSource) onClearMedia?.();
            onUpdate({ fill: "" });
          } else if (shapeMediaSource) onClearMedia?.();
          else if (hasNoColorFill) onUpdate({ fill: value("studioShapeFillColor", "#101319") || "#101319" });
        }} triggerStyle={inputStyle} /></div>
      ) : null}
      {shapeMediaSource ? (
        <>
          <div style={shapeMediaPreview}>
            {shapeMediaType === "video" ? <video src={shapeMediaSource} muted autoPlay loop playsInline style={shapeMediaPreviewMedia} /> : <img src={shapeMediaSource} alt="" style={shapeMediaPreviewMedia} />}
          </div>
          <div style={mediaStatusRow}>
            <span>{shapeMediaType === "video" ? "Video fill" : "Image fill"}</span>
            <span style={mediaFileName}>{shapeMediaSource.startsWith("data:") ? "Attached media" : shapeMediaSource}</span>
          </div>
          <div style={mediaActionRow}>
            <button type="button" style={mediaActionButton} onClick={() => onSetMedia?.(shapeMediaType)}>Replace media</button>
            {!isMediaAddon ? <button type="button" style={removeMediaActionButton} onClick={onClearMedia}>Remove media</button> : null}
          </div>
          <div style={labelStyle}><span>Media fit</span><Dropdown value={shapeMediaFit} options={[{ value: "cover", label: "Cover" }, { value: "contain", label: "Contain" }, { value: "tile", label: "Tile" }]} onChange={(fit) => onUpdate({ studioShapeFillFit: fit as TemplateShapeImageFit })} triggerStyle={inputStyle} /></div>
          <div style={twoColumn}>
            <InspectorField label="Media scale (%)" type="number" value={String(Math.round(shapeMediaScale))} onChange={(next) => onUpdate({ studioShapeFillScale: Math.max(10, Math.min(400, Number(next) || 10)) })} />
            <InspectorField label="Media opacity (%)" type="number" value={String(Math.round(shapeMediaOpacity * 100))} onChange={(next) => onUpdate({ studioShapeFillOpacity: Math.max(0, Math.min(1, (Number(next) || 0) / 100)) })} />
            <InspectorField label="Media offset X (%)" type="number" value={String(Math.round(shapeMediaX))} onChange={(next) => onUpdate({ studioShapeFillX: Math.max(-200, Math.min(200, Number(next) || 0)) })} />
            <InspectorField label="Media offset Y (%)" type="number" value={String(Math.round(shapeMediaY))} onChange={(next) => onUpdate({ studioShapeFillY: Math.max(-200, Math.min(200, Number(next) || 0)) })} />
          </div>
        </>
      ) : !hasNoColorFill ? (
        <InspectorField label="Fill color" type="color" value={value("fill", "#101319")} onChange={(fill) => onUpdate({ fill })} />
      ) : <div style={{ color: "var(--fg-subtle)", fontSize: 11, marginBottom: 7 }}>No fill</div>}
      <div style={labelStyle}><span>Blend mode</span><Dropdown value={value("globalCompositeOperation", "source-over")} options={[{ value: "source-over", label: "Normal" }, { value: "multiply", label: "Multiply" }, { value: "screen", label: "Screen" }, { value: "overlay", label: "Overlay" }, { value: "darken", label: "Darken" }, { value: "lighten", label: "Lighten" }]} onChange={(globalCompositeOperation) => onUpdate({ globalCompositeOperation })} triggerStyle={inputStyle} /></div>
    </InspectorSection>
    <InspectorSection title="Stroke">
      <div style={twoColumn}>
        <InspectorField label="Stroke color" type="color" value={value("stroke", STUDIO_DEFAULT_STROKE)} onChange={(stroke) => onUpdate({ stroke })} />
        <InspectorField label="Stroke width" type="number" value={value("strokeWidth", "1")} onChange={(next) => onUpdate({ strokeWidth: Math.max(0, Number(next) || 0) })} />
      </div>
      <div style={labelStyle}><span>Stroke pattern</span><Dropdown value={Array.isArray(object.strokeDashArray) && object.strokeDashArray.length > 0 ? object.strokeDashArray[0] === 1 ? "dotted" : "dashed" : "solid"} options={[{ value: "solid", label: "Solid" }, { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" }]} onChange={(pattern) => onUpdate({ strokeDashArray: pattern === "dashed" ? [12, 8] : pattern === "dotted" ? [1, 6] : null })} triggerStyle={inputStyle} /></div>
      {supportsStrokeStyle ? <div style={twoColumn}><div style={labelStyle}><span>Line cap</span><Dropdown value={value("strokeLineCap", "round")} options={["butt", "round", "square"].map((entry) => ({ value: entry, label: entry }))} onChange={(strokeLineCap) => onUpdate({ strokeLineCap })} triggerStyle={inputStyle} /></div><div style={labelStyle}><span>Line join</span><Dropdown value={value("strokeLineJoin", "round")} options={["miter", "round", "bevel"].map((entry) => ({ value: entry, label: entry }))} onChange={(strokeLineJoin) => onUpdate({ strokeLineJoin })} triggerStyle={inputStyle} /></div></div> : null}
    </InspectorSection>
    {supportsRadius || shapeKind === "polygon" || shapeKind === "star" ? <InspectorSection title="Geometry">
      {supportsRadius ? <InspectorField label="Corner radius" type="number" value={value("rx", "8")} onChange={(next) => { const radius = Math.max(0, Number(next) || 0); onUpdate({ rx: radius, ry: radius }); }} /> : null}
      {shapeKind === "polygon" ? <InspectorField label="Sides" type="number" value={value("polygonSides", "6")} onChange={(next) => onUpdate({ polygonSides: Math.max(3, Math.min(12, Number(next) || 3)) })} /> : null}
      {shapeKind === "star" ? <div style={twoColumn}><InspectorField label="Points" type="number" value={value("starPoints", "5")} onChange={(next) => onUpdate({ starPoints: Math.max(3, Math.min(10, Number(next) || 3)) })} /><InspectorField label="Inner radius (%)" type="number" value={String(Math.round(number("starInnerRadius", 0.44) * 100))} onChange={(next) => onUpdate({ starInnerRadius: Math.max(0.08, Math.min(0.92, (Number(next) || 8) / 100)) })} /></div> : null}
    </InspectorSection> : null}
    <InspectorSection title="Shadow">
      <InspectorField label="Shadow color" type="color" value={typeof shadow.color === "string" ? shadow.color : "#000000"} onChange={(color) => setShadow({ color })} />
      <InspectorField label="Shadow blur" type="number" value={String(shadow.blur ?? 0)} onChange={(next) => setShadow({ blur: Math.max(0, Number(next) || 0) })} />
      <div style={twoColumn}><InspectorField label="Offset X" type="number" value={String(shadow.offsetX ?? 0)} onChange={(next) => setShadow({ offsetX: Number(next) || 0 })} /><InspectorField label="Offset Y" type="number" value={String(shadow.offsetY ?? 0)} onChange={(next) => setShadow({ offsetY: Number(next) || 0 })} /></div>
    </InspectorSection>
  </div>;
}

const STUDIO_DEFAULT_STROKE = "#8c62ff";

function InspectorField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  if (type === "color") {
    return <label style={labelStyle}>
      {label}
      <div style={{ display: "flex", gap: 4 }}>
        <input type="color" value={value || "#000000"} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, height: 29, padding: 2, flex: 1 }} />
        <button
          type="button"
          onClick={() => onChange("")}
          title={`Clear ${label.toLowerCase()}`}
          style={{ ...noneColorButton, opacity: value ? 1 : 0.55 }}
        >None</button>
      </div>
    </label>;
  }
  return <label style={labelStyle}>{label}<input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} /></label>;
}

function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return <details style={{ border: "1px solid var(--border-base)", borderRadius: 6, marginBottom: 6 }}><summary style={{ cursor: "pointer", padding: 7, color: "var(--fg-base)", fontSize: 11, fontWeight: 700 }}>{title}</summary><div style={{ padding: 8 }}>{children}</div></details>;
}

function mediaTypeFor(file: File): TemplateBackgroundMedia["type"] {
  if (file.type.startsWith("video/")) return "video";
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  return ["avi", "m4v", "mkv", "mov", "mp4", "ogv", "webm"].includes(extension) ? "video" : "image";
}

function isImagePath(path: string): boolean {
  return /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(path);
}

function MediaBackgroundControls({ media, onChange, onStagingChange, cameraEditMode, onCameraEditModeChange }: { media: TemplateBackgroundMedia | null; onChange: (media: TemplateBackgroundMedia | null) => void; onStagingChange?: (staging: boolean) => void; cameraEditMode: CameraEditMode; onCameraEditModeChange: (mode: CameraEditMode) => void }) {
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const latestMediaRef = useRef(media);
  const preparationIdRef = useRef(0);
  const videoImportRef = useRef<AbortController | null>(null);
  useEffect(() => { latestMediaRef.current = media; }, [media]);
  const [videoImportState, setVideoImportState] = useState<"idle" | "importing" | "preparing">("idle");
  const [videoImportPercent, setVideoImportPercent] = useState<number | null>(null);
  const [removeHovered, setRemoveHovered] = useState(false);
  const [sourceKind, setSourceKind] = useState<"file" | "camera">(media?.type === "camera" ? "camera" : "file");
  const chooseMedia = async () => {
    if (!("__TAURI_INTERNALS__" in window)) {
      mediaInputRef.current?.click();
      return;
    }
    let preparationId = 0;
    try {
      const selected = await open({
        multiple: false,
      });
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (!path) return;
      preparationId = ++preparationIdRef.current;
      videoImportRef.current?.abort();
      videoImportRef.current = null;
      setVideoImportState("importing");
      setVideoImportPercent(null);
      onStagingChange?.(true);
      const name = path.split(/[\\/]/).pop() || "Media";
      const previous = latestMediaRef.current;
      if (isImagePath(path)) {
        const src = await invoke<string>("read_template_image_file", { path });
        if (preparationIdRef.current !== preparationId) return;
        const defaults: TemplateBackgroundMedia = { type: "image", src, name, fit: "cover", loop: false, x: 0, y: 0, width: 100, height: 100, opacity: 1 };
        const next: TemplateBackgroundMedia = { ...defaults, ...previous, type: "image", src, name };
        latestMediaRef.current = next;
        onChange(next);
        onStagingChange?.(false);
        return;
      }
      const controller = new AbortController();
      videoImportRef.current = controller;
      const asset = await importVideo(path, {
        signal: controller.signal,
        onProgress: (event) => {
          if (preparationIdRef.current === preparationId) {
            setVideoImportState(event.state === "queued" || event.state === "precheck" ? "importing" : "preparing");
            setVideoImportPercent(event.percent);
          }
        },
      });
      if (preparationIdRef.current !== preparationId) return;
      const defaults: TemplateBackgroundMedia = { type: "video", src: asset.path, name, fit: "cover", loop: true, x: 0, y: 0, width: 100, height: 100, opacity: 1, muted: true, speed: 1 };
      const next: TemplateBackgroundMedia = { ...defaults, ...previous, type: "video", src: asset.path, name };
      latestMediaRef.current = next;
      onChange(next);
      onStagingChange?.(false);
    } catch (error) {
      if (preparationIdRef.current === preparationId) {
        onStagingChange?.(false);
        if ((error as { code?: string })?.code !== "IMPORT_CANCELLED") {
          window.alert(`The media could not be imported: ${importErrorMessage(error)}`);
        }
      }
    } finally {
      if (preparationIdRef.current === preparationId) {
        videoImportRef.current = null;
        setVideoImportState("idle");
        setVideoImportPercent(null);
      }
    }
  };
  const readMediaFile = (file: File) => {
    if (mediaTypeFor(file) === "video") {
      window.alert("Open SermonSync in the desktop app to import videos.");
      return;
    }
    // Browser-only fallback. The desktop picker imports directly from a path
    // so a selected video never passes through FileReader or a data URL.
    if (file.size > 32 * 1024 * 1024) {
      window.alert("That media file is too large for a template background. Please choose a file smaller than 32 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => window.alert("The media file could not be read.");
    reader.onload = () => {
      const src = String(reader.result);
      const type = mediaTypeFor(file);
      preparationIdRef.current += 1;
      setVideoImportState("idle");
      onStagingChange?.(false);
      const next = { name: file.name, type, src, fit: "cover" as const, loop: true, x: 0, y: 0, width: 100, height: 100, opacity: 1, muted: true, speed: 1 };
      latestMediaRef.current = { ...(latestMediaRef.current ?? next), name: next.name, type, src };
      onChange(latestMediaRef.current);
    };
    reader.readAsDataURL(file);
  };
  const patch = (changes: Partial<TemplateBackgroundMedia>) => media && onChange({ ...media, ...changes });
  const fileMedia = media?.type === "camera" ? null : media;
  const filePicker = (
    <div style={{ minWidth: 0, marginBottom: 7 }}>
      <div style={{ ...labelStyle, marginBottom: 4 }}>Background media</div>
      <button type="button" onClick={() => { void chooseMedia(); }} style={{ ...mediaActionButton, width: "100%", marginBottom: 6 }}>Choose Media</button>
      <input ref={mediaInputRef} type="file" accept="image/*,video/*" aria-label="Choose background media" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) readMediaFile(file); }} style={{ display: "none" }} />
      <div style={{ ...mediaStatusRow, marginBottom: 2 }}>
        <span style={{ ...mediaFileName, flex: 1 }} title={fileMedia?.name ?? "No media selected"}>{fileMedia?.name ?? "No media selected"}</span>
        <button type="button" disabled={!fileMedia} onClick={() => { preparationIdRef.current += 1; videoImportRef.current?.abort(); latestMediaRef.current = null; setVideoImportState("idle"); onStagingChange?.(false); onChange(null); }} onMouseEnter={() => setRemoveHovered(true)} onMouseLeave={() => setRemoveHovered(false)} style={{ ...removeMediaButton, background: removeHovered && fileMedia ? "var(--color-error)" : "transparent", color: removeHovered && fileMedia ? "var(--fg-on-accent)" : "var(--color-error)", opacity: fileMedia ? 1 : 0.4, cursor: fileMedia ? "pointer" : "default" }} title="Remove media" aria-label="Remove media">
          ×
        </button>
      </div>
      <div role="status" aria-live="polite" style={{ height: 18, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", fontSize: 11, color: "var(--fg-subtle)" }}>
        {videoImportState === "importing" ? "Importing media…" : videoImportState === "preparing" ? `Preparing video for projection${videoImportPercent == null ? "…" : ` · ${videoImportPercent}%`}` : "\u00a0"}
      </div>
      {videoImportState !== "idle" ? <button type="button" onClick={() => {
        preparationIdRef.current += 1;
        videoImportRef.current?.abort();
        videoImportRef.current = null;
        setVideoImportState("idle");
        setVideoImportPercent(null);
        onStagingChange?.(false);
      }} style={{ ...mediaActionButton, width: "100%", marginTop: 4 }}>Cancel import</button> : null}
    </div>
  );

  if (!media || media.type === "camera" || sourceKind === "camera") {
    const cameraMedia = media?.type === "camera" ? media : null;
    return (
      <>
        <div style={buttonRow}>
          <button type="button" style={toggleStyle(sourceKind === "file")} onClick={() => setSourceKind("file")}>Photo / Video</button>
          <button type="button" style={toggleStyle(sourceKind === "camera")} onClick={() => setSourceKind("camera")}>Live Camera</button>
        </div>
        {sourceKind === "camera" ? (
          <>
            <CameraBackgroundPicker media={cameraMedia} onChange={onChange} />
            {cameraMedia ? (
              <>
                <div style={twoColumn}>
                  <InspectorField label="X (%)" type="number" value={String(Math.round(cameraMedia.x))} onChange={(value) => patch({ x: Math.max(0, Math.min(100 - cameraMedia.width, Number(value) || 0)) })} />
                  <InspectorField label="Y (%)" type="number" value={String(Math.round(cameraMedia.y))} onChange={(value) => patch({ y: Math.max(0, Math.min(100 - cameraMedia.height, Number(value) || 0)) })} />
                  <InspectorField label="Width (%)" type="number" value={String(Math.round(cameraMedia.width))} onChange={(value) => patch({ width: Math.max(5, Math.min(100 - cameraMedia.x, Number(value) || 5)) })} />
                  <InspectorField label="Height (%)" type="number" value={String(Math.round(cameraMedia.height))} onChange={(value) => patch({ height: Math.max(5, Math.min(100 - cameraMedia.y, Number(value) || 5)) })} />
                </div>
                <div style={twoColumn}>
                  <div style={labelStyle}><span>Fit</span><Dropdown value={cameraMedia.fit} options={["cover", "contain", "fill"].map((fit) => ({ value: fit, label: fit[0].toUpperCase() + fit.slice(1) }))} onChange={(fit) => patch({ fit: fit as TemplateBackgroundMedia["fit"] })} triggerStyle={inputStyle} /></div>
                  <div style={labelStyle}><span>Blend mode</span><Dropdown value={cameraMedia.blendMode ?? "normal"} options={["normal", "multiply", "screen", "overlay", "darken", "lighten"].map((mode) => ({ value: mode, label: mode[0].toUpperCase() + mode.slice(1) }))} onChange={(blendMode) => patch({ blendMode })} triggerStyle={inputStyle} /></div>
                </div>
                <div style={buttonRow}><button type="button" style={toggleStyle(Boolean(cameraMedia.flipX))} onClick={() => patch({ flipX: !cameraMedia.flipX })}>Mirror horizontally</button></div>
                <InspectorSection title="Cropping">
                  <div style={buttonRow}><button type="button" aria-pressed={cameraEditMode === "crop"} style={toggleStyle(cameraEditMode === "crop")} onClick={() => onCameraEditModeChange(cameraEditMode === "crop" ? "frame" : "crop")}>{cameraEditMode === "crop" ? "Done cropping" : "Crop on canvas"}</button></div>
                  <div style={twoColumn}>
                  <InspectorField label="Top (%)" type="number" value={String(Math.round(cameraMedia.cropTop ?? 0))} onChange={(value) => patch({ cropTop: Math.max(0, Math.min(95 - (cameraMedia.cropBottom ?? 0), Number(value) || 0)) })} />
                  <InspectorField label="Right (%)" type="number" value={String(Math.round(cameraMedia.cropRight ?? 0))} onChange={(value) => patch({ cropRight: Math.max(0, Math.min(95 - (cameraMedia.cropLeft ?? 0), Number(value) || 0)) })} />
                  <InspectorField label="Bottom (%)" type="number" value={String(Math.round(cameraMedia.cropBottom ?? 0))} onChange={(value) => patch({ cropBottom: Math.max(0, Math.min(95 - (cameraMedia.cropTop ?? 0), Number(value) || 0)) })} />
                  <InspectorField label="Left (%)" type="number" value={String(Math.round(cameraMedia.cropLeft ?? 0))} onChange={(value) => patch({ cropLeft: Math.max(0, Math.min(95 - (cameraMedia.cropRight ?? 0), Number(value) || 0)) })} />
                  </div>
                </InspectorSection>
                <InspectorField label="Opacity (%)" type="number" value={String(Math.round((cameraMedia.opacity ?? 1) * 100))} onChange={(value) => patch({ opacity: Math.max(0, Math.min(1, (Number(value) || 0) / 100)) })} />
              </>
            ) : null}
          </>
        ) : filePicker}
      </>
    );
  }
  return <>
    <div style={buttonRow}>
      <button type="button" style={toggleStyle(true)} onClick={() => setSourceKind("file")}>Photo / Video</button>
      <button type="button" style={toggleStyle(false)} onClick={() => setSourceKind("camera")}>Live Camera</button>
    </div>
    {filePicker}
    <div style={twoColumn}>
      <div style={labelStyle}><span>Fit</span><Dropdown value={media.fit} options={["cover", "contain", "fill"].map((fit) => ({ value: fit, label: fit[0].toUpperCase() + fit.slice(1) }))} onChange={(fit) => patch({ fit: fit as TemplateBackgroundMedia["fit"] })} triggerStyle={inputStyle} /></div>
      <div style={labelStyle}><span>Blend mode</span><Dropdown value={media.blendMode ?? "normal"} options={["normal", "multiply", "screen", "overlay", "darken", "lighten"].map((mode) => ({ value: mode, label: mode[0].toUpperCase() + mode.slice(1) }))} onChange={(blendMode) => patch({ blendMode })} triggerStyle={inputStyle} /></div>
    </div>
    <div style={buttonRow}><button type="button" style={toggleStyle(Boolean(media.flipX))} onClick={() => patch({ flipX: !media.flipX })}>Flip horizontally</button><button type="button" style={toggleStyle(Boolean(media.flipY))} onClick={() => patch({ flipY: !media.flipY })}>Flip vertically</button></div>
    {media.type === "video" ? <div style={buttonRow}><button type="button" aria-pressed={media.muted !== false} style={toggleStyle(media.muted !== false)} onClick={() => patch({ muted: media.muted === false })}>{media.muted !== false ? "Muted" : "Mute"}</button><button type="button" aria-pressed={media.loop !== false} style={toggleStyle(media.loop !== false)} onClick={() => patch({ loop: media.loop === false })}>{media.loop !== false ? "Looping" : "Loop"}</button></div> : null}
    {media.type === "video" ? <InspectorField label="Speed" type="number" value={String(media.speed ?? 1)} onChange={(value) => patch({ speed: Math.max(0.1, Number(value) || 0.1) })} /> : null}
    <InspectorSection title="Cropping"><div style={twoColumn}><InspectorField label="Top (%)" type="number" value={String(media.cropTop ?? 0)} onChange={(value) => patch({ cropTop: Math.max(0, Math.min(95, Number(value) || 0)) })} /><InspectorField label="Right (%)" type="number" value={String(media.cropRight ?? 0)} onChange={(value) => patch({ cropRight: Math.max(0, Math.min(95, Number(value) || 0)) })} /><InspectorField label="Bottom (%)" type="number" value={String(media.cropBottom ?? 0)} onChange={(value) => patch({ cropBottom: Math.max(0, Math.min(95, Number(value) || 0)) })} /><InspectorField label="Left (%)" type="number" value={String(media.cropLeft ?? 0)} onChange={(value) => patch({ cropLeft: Math.max(0, Math.min(95, Number(value) || 0)) })} /></div></InspectorSection>
    <InspectorSection title="Filters"><div style={twoColumn}><InspectorField label="Hue rotate" type="number" value={String(media.hueRotate ?? 0)} onChange={(value) => patch({ hueRotate: Number(value) || 0 })} /><InspectorField label="Invert (%)" type="number" value={String(media.invert ?? 0)} onChange={(value) => patch({ invert: Math.max(0, Math.min(100, Number(value) || 0)) })} /><InspectorField label="Blur (px)" type="number" value={String(media.blur ?? 0)} onChange={(value) => patch({ blur: Math.max(0, Number(value) || 0) })} /><InspectorField label="Grayscale (%)" type="number" value={String(media.grayscale ?? 0)} onChange={(value) => patch({ grayscale: Math.max(0, Math.min(100, Number(value) || 0)) })} /><InspectorField label="Sepia (%)" type="number" value={String(media.sepia ?? 0)} onChange={(value) => patch({ sepia: Math.max(0, Math.min(100, Number(value) || 0)) })} /><InspectorField label="Brightness (%)" type="number" value={String(media.brightness ?? 100)} onChange={(value) => patch({ brightness: Math.max(0, Number(value) || 0) })} /><InspectorField label="Contrast (%)" type="number" value={String(media.contrast ?? 100)} onChange={(value) => patch({ contrast: Math.max(0, Number(value) || 0) })} /><InspectorField label="Saturate (%)" type="number" value={String(media.saturate ?? 100)} onChange={(value) => patch({ saturate: Math.max(0, Number(value) || 0) })} /></div></InspectorSection>
    <InspectorField label="Opacity (%)" type="number" value={String(Math.round((media.opacity ?? 1) * 100))} onChange={(value) => patch({ opacity: Math.max(0, Math.min(1, (Number(value) || 0) / 100)) })} />
  </>;
}

function CameraBackgroundPicker({ media, onChange }: { media: TemplateBackgroundMedia | null; onChange: (media: TemplateBackgroundMedia | null) => void }) {
  const networkCameras = useCameraStore((s) => s.networkCameras);
  const [localCameras, setLocalCameras] = useState<LocalCameraDevice[]>([]);
  const [isDetecting, setIsDetecting] = useState(() => backendAvailable());
  const [detectError, setDetectError] = useState<string | null>(null);

  const detectLocalCameras = useCallback(async () => {
    if (!backendAvailable()) return;
    setIsDetecting(true);
    setDetectError(null);
    try {
      setLocalCameras(await listLocalCameras());
    } catch (error) {
      setDetectError(error instanceof Error ? error.message : "Unable to access camera devices.");
    } finally {
      setIsDetecting(false);
    }
  }, []);

  useEffect(() => {
    if (!backendAvailable()) return;
    const initialScan = window.setTimeout(() => void detectLocalCameras(), 0);
    const mediaDevices = navigator.mediaDevices;
    const handleDeviceChange = () => void detectLocalCameras();
    mediaDevices?.addEventListener?.("devicechange", handleDeviceChange);
    return () => {
      window.clearTimeout(initialScan);
      mediaDevices?.removeEventListener?.("devicechange", handleDeviceChange);
    };
  }, [detectLocalCameras]);

  useEffect(() => {
    if (media?.type !== "camera" || media.cameraSourceType !== "local" || localCameras.length === 0) return;
    if (localCameras.some((camera) => camera.deviceId === media.cameraDeviceId)) return;
    const savedLabel = (media.cameraLabel || media.name || "").replace(/\s*\(v4l2\)\s*$/i, "").trim().toLocaleLowerCase();
    const replacement = localCameras.find((camera) => {
      const label = camera.label.trim().toLocaleLowerCase();
      return savedLabel && (label === savedLabel || label.includes(savedLabel) || savedLabel.includes(label));
    });
    if (replacement) onChange({ ...media, cameraDeviceId: replacement.deviceId, cameraLabel: replacement.label });
  }, [localCameras, media, onChange]);

  const sourceType = media?.cameraSourceType ?? (localCameras.length > 0 ? "local" : "network");
  const pickLocal = (deviceId: string) => {
    const label = localCameras.find((d) => d.deviceId === deviceId)?.label ?? "Camera";
    onChange({
      ...(media?.type === "camera" ? media : { type: "camera", src: "", fit: "cover", loop: false, x: 0, y: 0, width: 100, height: 100, opacity: 1 }),
      name: label, cameraSourceType: "local", cameraDeviceId: deviceId, cameraLabel: label, cameraUrl: undefined,
    });
  };
  const pickNetwork = (cameraId: string) => {
    const camera = networkCameras.find((c) => c.id === cameraId);
    if (!camera) return;
    onChange({
      ...(media?.type === "camera" ? media : { type: "camera", src: "", fit: "cover", loop: false, x: 0, y: 0, width: 100, height: 100, opacity: 1 }),
      name: camera.name, cameraSourceType: "network", cameraUrl: camera.url, cameraDeviceId: undefined, cameraLabel: undefined,
    });
  };

  return (
    <>
      <div style={buttonRow}>
        <button type="button" style={toggleStyle(sourceType === "local")} onClick={() => localCameras[0] && pickLocal(media?.cameraDeviceId ?? localCameras[0].deviceId)}>Wired / USB</button>
        <button type="button" style={toggleStyle(sourceType === "network")} onClick={() => networkCameras[0] && pickNetwork(networkCameras[0].id)}>Wi-Fi Phone</button>
      </div>
      {sourceType === "local" ? (
        localCameras.length > 0 ? (
          <div style={labelStyle}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
              <span>Camera</span>
              <button type="button" onClick={() => void detectLocalCameras()} disabled={isDetecting} style={rescanButtonStyle(isDetecting)}>
                {isDetecting ? "Scanning…" : "Rescan"}
              </button>
            </span>
            <Dropdown value={media?.cameraDeviceId ?? ""} options={localCameras.map((d) => ({ value: d.deviceId, label: d.label }))} onChange={pickLocal} triggerStyle={inputStyle} />
          </div>
        ) : (
          <div style={{ display: "grid", gap: "7px" }}>
            <span style={{ fontSize: "11px", color: "var(--fg-subtle)" }}>{isDetecting ? "Detecting cameras…" : detectError ?? "No wired/USB cameras detected."}</span>
            <button type="button" onClick={() => void detectLocalCameras()} disabled={isDetecting} style={rescanButtonStyle(isDetecting)}>
              {isDetecting ? "Scanning…" : "Rescan for cameras"}
            </button>
          </div>
        )
      ) : (
        networkCameras.length > 0 ? (
          <div style={labelStyle}><span>Wi-Fi camera</span><Dropdown value={networkCameras.find((c) => c.url === media?.cameraUrl)?.id ?? ""} options={networkCameras.map((c) => ({ value: c.id, label: c.name }))} onChange={pickNetwork} triggerStyle={inputStyle} /></div>
        ) : (
          <span style={{ fontSize: "11px", color: "var(--fg-subtle)" }}>No Wi-Fi cameras saved yet — add one in Settings → Camera &amp; Wireless.</span>
        )
      )}
    </>
  );
}

const SYSTEM_FONTS = ["Inter", "CMGSans", "Adwaita Sans", "Adwaita Mono", "Arial", "Cantarell", "Carlito", "Calibri", "Comfortaa", "Courier New", "Droid Sans", "FreeSans", "Georgia", "Liberation Mono", "Liberation Sans", "Liberation Serif", "Montserrat", "Noto Sans", "Noto Sans Arabic", "Noto Sans Bengali", "Noto Sans Devanagari", "Noto Sans Hebrew", "Noto Sans Japanese", "Noto Sans Math", "Noto Sans Mono", "Noto Serif", "Open Sans", "Red Hat Display", "Red Hat Text", "Roboto", "Source Code Pro", "Tahoma", "Times New Roman", "Ubuntu", "Verdana"].sort();
SYSTEM_FONTS.push("Inter, system-ui, sans-serif");

const sectionTitle: CSSProperties = { color: "var(--color-primary)", fontWeight: 700, fontSize: "12px", margin: "8px 0" };
const labelStyle: CSSProperties = { display: "grid", gap: "3px", color: "var(--fg-muted)", fontSize: "11px", marginBottom: "7px" };
const inputStyle: CSSProperties = { width: "100%", boxSizing: "border-box", border: "none", borderRadius: "4px", background: "var(--bg-base)", color: "var(--fg-base)", padding: "6px", fontSize: "12px" };
const shapeMediaPreview: CSSProperties = { width: "100%", aspectRatio: "16 / 7", overflow: "hidden", border: "1px solid var(--border-base)", borderRadius: "5px", background: "var(--bg-base)", marginBottom: "6px" };
const shapeMediaPreviewMedia: CSSProperties = { width: "100%", height: "100%", display: "block", objectFit: "cover" };
const mediaStatusRow: CSSProperties = { display: "flex", alignItems: "center", gap: "6px", minWidth: 0, marginBottom: "7px", color: "var(--fg-base)", fontSize: "11px" };
const mediaFileName: CSSProperties = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--fg-subtle)" };
const mediaActionRow: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "8px" };
const mediaActionButton: CSSProperties = { border: "1px solid var(--border-base)", borderRadius: "4px", background: "var(--bg-base)", color: "var(--fg-base)", padding: "6px", cursor: "pointer", fontSize: "11px" };
const rescanButtonStyle = (disabled: boolean): CSSProperties => ({ border: "1px solid var(--border-base)", borderRadius: "4px", background: "var(--bg-elevated)", color: "var(--fg-base)", padding: "3px 6px", cursor: disabled ? "not-allowed" : "pointer", fontSize: "10px", opacity: disabled ? 0.6 : 1 });
const removeMediaActionButton: CSSProperties = { ...mediaActionButton, borderColor: "color-mix(in srgb, var(--color-error) 60%, var(--border-base))", color: "var(--color-error)" };
const noneColorButton: CSSProperties = { border: "none", borderRadius: "4px", background: "var(--bg-base)", color: "var(--fg-muted)", padding: "0 7px", fontSize: "10px", cursor: "pointer" };
const removeMediaButton: CSSProperties = { width: 29, height: 29, flexShrink: 0, display: "grid", placeItems: "center", padding: 0, border: "1px solid var(--color-error)", borderRadius: "4px", background: "transparent", color: "var(--color-error)", cursor: "pointer", transition: "background 120ms ease, color 120ms ease" };
const buttonRow: CSSProperties = { display: "flex", gap: "3px", marginBottom: "8px" };
const toggleStyle = (active: boolean): CSSProperties => ({ flex: 1, border: "1px solid var(--border-base)", background: active ? "var(--color-primary-muted)" : "var(--bg-base)", color: active ? "var(--color-primary)" : "var(--fg-muted)", padding: "6px 2px", cursor: "pointer", fontSize: "10px" });
const twoColumn: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 };
const iconButtonRow: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 3 };
const verticalAlignRow: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3, marginTop: 3 };
const alignButtonStyle = (active: boolean): CSSProperties => ({ border: "1px solid var(--border-base)", background: active ? "var(--color-primary-muted)" : "var(--bg-base)", color: active ? "var(--color-primary)" : "var(--fg-muted)", fontSize: 20, padding: 6, cursor: "pointer" });
const verticalAlignButtonStyle = alignButtonStyle;

const iconBtn: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "var(--fg-subtle)",
  borderRadius: "4px",
  width: "20px",
  height: "20px",
  fontSize: "11px",
  lineHeight: 1,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const historyButton: CSSProperties = {
  width: "25px",
  height: "24px",
  padding: 0,
  border: "1px solid var(--border-base)",
  borderRadius: "4px",
  background: "var(--bg-elevated)",
  color: "var(--fg-base)",
  fontSize: "15px",
  lineHeight: 1,
  cursor: "pointer",
};
