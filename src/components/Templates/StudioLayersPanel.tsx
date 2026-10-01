import type { StudioFabricObjectData } from "../../types/studioDocument";
import type { StudioBackgroundMode } from "../../types/studioDocument";
import type { TemplateBackgroundMedia } from "../../types/templates";
import type { OverlayMode } from "../../types/state";
import { Dropdown } from "../Settings/primitives";
import type { StudioTextSelection } from "./FabricStudioCanvas";
import { MediaBackgroundControls } from "./inspector/MediaBackgroundControls";
import { ShapeInspector } from "./inspector/ShapeInspector";
import { InspectorField, InspectorSection } from "./inspector/StudioInspectorFields";
import { SYSTEM_FONTS, sectionTitle, labelStyle, inputStyle, buttonRow, toggleStyle, twoColumn, iconButtonRow, verticalAlignRow, alignButtonStyle, verticalAlignButtonStyle, iconBtn, historyButton } from "./inspector/studioInspectorStyles";

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

export function StudioLayersPanel({ objects, selectedIds, textSelection, onSelect, onToggleVisibility, onToggleLock, onDelete, onUpdate, onSetShapeMedia, onClearShapeMedia, onReorder, canUndo, canRedo, onUndo, onRedo, background, onBackgroundChange, backgroundMode, backgroundColor, backgroundGradientStart, backgroundGradientEnd, backgroundGradientAngle, backgroundGradientStyle, backgroundBlur, backgroundMedia, onBackgroundConfigChange, screenLayout, onScreenLayoutChange }: StudioLayersPanelProps) {
  // Fabric stacks objects back-to-front; the panel lists front-to-back like most design tools.
  const ordered = [...objects].map((object, index) => ({ object, index })).reverse();

  return (
    <div style={{ minHeight: 0, overflow: "auto", background: "var(--bg-surface)", borderLeft: "1px solid var(--border-base)" }}>
      {screenLayout && onScreenLayoutChange ? <div style={{ padding: "10px", borderBottom: "1px solid var(--border-base)" }}>
        <div style={sectionTitle}>Screen layout</div>
        <div style={labelStyle}><span>Projection layout</span><Dropdown value={screenLayout} options={[{ value: "widescreen", label: "Widescreen Slide" }, { value: "lower-third", label: "Lower Third" }]} onChange={(layout) => onScreenLayoutChange(layout as OverlayMode)} triggerStyle={inputStyle} /></div>
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
        {backgroundMode === "media" ? <MediaBackgroundControls media={backgroundMedia} onChange={(media) => onBackgroundConfigChange({ mode: "media", media, backgroundBlur })} /> : null}
        <InspectorField label="Background blur (px)" type="number" value={String(backgroundBlur)} onChange={(value) => onBackgroundConfigChange({ mode: backgroundMode, color: backgroundColor, gradientStart: backgroundGradientStart, gradientEnd: backgroundGradientEnd, gradientAngle: backgroundGradientAngle, gradientStyle: backgroundGradientStyle, backgroundBlur: Math.max(0, Math.min(100, Number(value) || 0)), media: backgroundMedia })} />
      </div>
    </div>
  );
}
