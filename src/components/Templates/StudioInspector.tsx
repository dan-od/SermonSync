import { useRef, useState, type CSSProperties, type ReactNode } from "react";

import type {
  TemplateBackgroundMedia,
  TemplateLayer,
  TemplateMediaFit,
  TemplateScene,
  TemplateShapeLayer,
  TemplateTextLayer,
} from "../../types/templates";
import { Dropdown } from "../Settings/primitives";
import { BACKGROUND_MEDIA_ID } from "./StudioCanvas";
import { StudioLayersPanel } from "./StudioLayersPanel";

const FONT_FAMILY_OPTIONS = [
  { value: "var(--font-sans)", label: "Sans" },
  { value: "var(--font-mono)", label: "Mono" },
  { value: "Georgia, serif", label: "Serif" },
  { value: "Times New Roman, serif", label: "Times" },
];

const FONT_STYLE_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "italic", label: "Italic" },
];

const FONT_WEIGHT_OPTIONS = [
  { value: "300", label: "Light (300)" },
  { value: "400", label: "Regular (400)" },
  { value: "500", label: "Medium (500)" },
  { value: "600", label: "Semi Bold (600)" },
  { value: "700", label: "Bold (700)" },
  { value: "800", label: "Extra Bold (800)" },
  { value: "900", label: "Black (900)" },
];

const ALIGN_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

const AUTO_FIT_OPTIONS = [
  { value: "none", label: "None" },
  { value: "shrink", label: "Shrink to Fit" },
  { value: "grow", label: "Grow to Fit" },
];

const BACKGROUND_FIT_OPTIONS = [
  { value: "cover", label: "Cover" },
  { value: "contain", label: "Contain" },
  { value: "fill", label: "Stretch" },
];

interface StudioInspectorProps {
  scene: TemplateScene;
  layers: TemplateLayer[];
  selectedLayerId: string | null;
  selectedLayer: TemplateLayer | null;
  onSelectLayer: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onToggleLock: (layerId: string) => void;
  onMoveForward: (layerId: string) => void;
  onMoveBackward: (layerId: string) => void;
  onDeleteLayer: (layerId: string) => void;
  onDuplicateLayer: (layerId: string) => void;
  onSceneBackgroundChange: (key: "backgroundStart" | "backgroundEnd", value: string) => void;
  onCanvasSizeChange: (width: number, height: number) => void;
  onBackgroundMediaSelect: (file: File) => void;
  onBackgroundMediaPatch: (patch: Partial<TemplateBackgroundMedia>) => void;
  onBackgroundMediaRemove: () => void;
  onLayerPatch: (layerId: string, patch: Partial<Omit<TemplateLayer, "type">>) => void;
  onTextPatch: (layerId: string, patch: Partial<TemplateTextLayer>) => void;
  onTextSelectionFormat: (layerId: string, patch: Partial<TemplateTextLayer>) => boolean;
  onShapePatch: (layerId: string, patch: Partial<TemplateShapeLayer>) => void;
}

export function StudioInspector({
  scene,
  layers,
  selectedLayerId,
  selectedLayer,
  onSelectLayer,
  onToggleVisibility,
  onToggleLock,
  onMoveForward,
  onMoveBackward,
  onDeleteLayer,
  onDuplicateLayer,
  onSceneBackgroundChange,
  onCanvasSizeChange,
  onBackgroundMediaSelect,
  onBackgroundMediaPatch,
  onBackgroundMediaRemove,
  onLayerPatch,
  onTextPatch,
  onTextSelectionFormat,
  onShapePatch,
}: StudioInspectorProps) {
  const [openSection, setOpenSection] = useState<string | null>("layers");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const media = scene.backgroundMedia;
  const isBackgroundSelected = selectedLayerId === BACKGROUND_MEDIA_ID;

  const toggle = (key: string) => setOpenSection((current) => (current === key ? null : key));
  const patchText = (layerId: string, patch: Partial<TemplateTextLayer>) => {
    if (onTextSelectionFormat(layerId, patch)) {
      return;
    }
    onTextPatch(layerId, patch);
  };

  return (
    <div style={{ minHeight: 0, overflow: "auto", background: "var(--bg-surface)", borderLeft: "1px solid var(--border-base)" }}>
      <div style={headerRowStyle}>
        <span style={{ fontWeight: 700, fontSize: "12px", color: "var(--fg-base)" }}>
          {selectedLayer ? (selectedLayer.type === "text" ? "Textbox" : "Shape") : isBackgroundSelected ? "Background Media" : "Scene"}
        </span>
        {selectedLayer ? (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--fg-subtle)" }}>
            Style overwrites {styleOverwriteCount(selectedLayer)}
          </span>
        ) : null}
      </div>

      <AccordionRow label="Layers" isOpen={openSection === "layers"} onToggle={() => toggle("layers")}>
        <StudioLayersPanel
          layers={layers}
          selectedLayerId={selectedLayerId}
          onSelectLayer={onSelectLayer}
          onToggleVisibility={onToggleVisibility}
          onToggleLock={onToggleLock}
          onMoveForward={onMoveForward}
          onMoveBackward={onMoveBackward}
          onDelete={onDeleteLayer}
          onDuplicate={onDuplicateLayer}
        />
      </AccordionRow>

      <AccordionRow label="Canvas Size" isOpen={openSection === "canvas"} onToggle={() => toggle("canvas")}>
        <div style={{ display: "grid", gap: "10px" }}>
          <label style={labelStyle}>
            Width (px)
            <input
              type="number"
              min={320}
              max={7680}
              value={scene.canvasWidth}
              onChange={(event) => onCanvasSizeChange(Number(event.target.value), scene.canvasHeight)}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Height (px)
            <input
              type="number"
              min={180}
              max={4320}
              value={scene.canvasHeight}
              onChange={(event) => onCanvasSizeChange(scene.canvasWidth, Number(event.target.value))}
              style={inputStyle}
            />
          </label>
        </div>
        <div style={{ marginTop: "12px" }}>
          <button type="button" style={ghostButtonStyle} onClick={() => onCanvasSizeChange(1920, 1080)}>
            Reset to 1920 × 1080
          </button>
        </div>
      </AccordionRow>

      <AccordionRow label="Background" isOpen={openSection === "background"} onToggle={() => toggle("background")}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
          <label style={labelStyle}>
            Gradient Start
            <input
              type="color"
              value={scene.backgroundStart}
              onChange={(event) => onSceneBackgroundChange("backgroundStart", event.target.value)}
              style={colorInputStyle}
            />
          </label>
          <label style={labelStyle}>
            Gradient End
            <input
              type="color"
              value={scene.backgroundEnd}
              onChange={(event) => onSceneBackgroundChange("backgroundEnd", event.target.value)}
              style={colorInputStyle}
            />
          </label>
        </div>

        <div style={{ borderTop: "1px solid var(--border-base)", paddingTop: "10px", display: "grid", gap: "8px" }}>
          <span style={{ fontSize: "11px", color: "var(--fg-muted)", fontWeight: 600 }}>Background Media</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            style={{ display: "none" }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onBackgroundMediaSelect(file);
              }
              event.target.value = "";
            }}
          />
          <button type="button" style={ghostButtonStyle} onClick={() => fileInputRef.current?.click()}>
            {media ? "Replace Media" : "Add Image or Video"}
          </button>

          {media ? (
            <div style={{ display: "grid", gap: "8px" }}>
              <label style={labelStyle}>
                Fit
                <Dropdown
                  value={media.fit}
                  options={BACKGROUND_FIT_OPTIONS}
                  onChange={(value) => onBackgroundMediaPatch({ fit: value as TemplateMediaFit })}
                />
              </label>

              {media.type === "video" ? (
                <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--fg-muted)", fontSize: "11px" }}>
                  <input
                    type="checkbox"
                    checked={media.loop}
                    onChange={(event) => onBackgroundMediaPatch({ loop: event.target.checked })}
                  />
                  Auto-loop video
                </label>
              ) : null}

              <RangeField
                label="Opacity"
                value={media.opacity}
                min={0.1}
                max={1}
                step={0.05}
                onChange={(value) => onBackgroundMediaPatch({ opacity: value })}
              />

              <button type="button" style={{ ...ghostButtonStyle, color: "var(--color-error)" }} onClick={onBackgroundMediaRemove}>
                Remove Media
              </button>
              <span style={{ fontSize: "10px", color: "var(--fg-subtle)" }}>
                Select the media on the canvas to drag or resize it.
              </span>
            </div>
          ) : null}
        </div>
      </AccordionRow>

      {!selectedLayer ? (
        <div style={{ padding: "24px 14px", color: "var(--fg-subtle)", fontSize: "12px" }}>
          Select a layer on the canvas or from the Layers section to edit its properties.
        </div>
      ) : (
        <>
          <AccordionRow label="Align" isOpen={openSection === "align"} onToggle={() => toggle("align")}>
            <div style={{ display: "grid", gap: "8px" }}>
              <RangeField
                label="X"
                value={selectedLayer.x}
                min={0}
                max={95}
                onChange={(value) => onLayerPatch(selectedLayer.id, { x: value })}
              />
              <RangeField
                label="Y"
                value={selectedLayer.y}
                min={0}
                max={95}
                onChange={(value) => onLayerPatch(selectedLayer.id, { y: value })}
              />
              <RangeField
                label="Width"
                value={selectedLayer.width}
                min={5}
                max={100}
                onChange={(value) => onLayerPatch(selectedLayer.id, { width: value })}
              />
              <RangeField
                label="Height"
                value={selectedLayer.height}
                min={5}
                max={100}
                onChange={(value) => onLayerPatch(selectedLayer.id, { height: value })}
              />
              <RangeField
                label="Rotation"
                value={selectedLayer.rotation}
                min={-180}
                max={180}
                onChange={(value) => onLayerPatch(selectedLayer.id, { rotation: value })}
              />
            </div>
          </AccordionRow>

          {selectedLayer.type === "text" ? (
            <AccordionRow label="Text" isOpen={openSection === "text"} onToggle={() => toggle("text")}>
              <div style={{ display: "grid", gap: "8px" }}>
                <div style={quickStyleRowStyle}>
                  <span style={quickStyleTitleStyle}>Typography</span>
                  <div style={quickStyleGridStyle}>
                    <label style={labelStyle}>
                      Family
                      <Dropdown
                        value={selectedLayer.fontFamily}
                        options={FONT_FAMILY_OPTIONS}
                        onChange={(value) => patchText(selectedLayer.id, { fontFamily: value })}
                      />
                    </label>
                    <label style={labelStyle}>
                      Weight
                      <Dropdown
                        value={`${selectedLayer.fontWeight}`}
                        options={FONT_WEIGHT_OPTIONS}
                        onChange={(value) => patchText(selectedLayer.id, { fontWeight: Number(value) })}
                      />
                    </label>
                    <label style={labelStyle}>
                      Style
                      <Dropdown
                        value={selectedLayer.fontStyle}
                        options={FONT_STYLE_OPTIONS}
                        onChange={(value) => patchText(selectedLayer.id, { fontStyle: value as "normal" | "italic" })}
                      />
                    </label>
                    <label style={labelStyle}>
                      Size (px)
                      <input
                        type="number"
                        min={12}
                        max={140}
                        value={selectedLayer.fontSize}
                        onChange={(event) => patchText(selectedLayer.id, { fontSize: Number(event.target.value) })}
                        style={inputStyle}
                      />
                    </label>
                    <label style={labelStyle}>
                      Fit
                      <Dropdown
                        value={selectedLayer.autoFit ?? "none"}
                        options={AUTO_FIT_OPTIONS}
                        onChange={(value) => patchText(selectedLayer.id, { autoFit: value as "none" | "shrink" | "grow" })}
                      />
                    </label>
                  </div>
                </div>
                <div style={quickStyleRowStyle}>
                  <span style={quickStyleTitleStyle}>Color & Outline</span>
                  <div style={quickStyleGridStyle}>
                    <ColorField
                      label="Text Color"
                      value={selectedLayer.color}
                      onChange={(value) => patchText(selectedLayer.id, { color: value })}
                    />
                    <ColorField
                      label="Outline Color"
                      value={selectedLayer.outlineColor}
                      onChange={(value) => patchText(selectedLayer.id, { outlineColor: value })}
                    />
                  </div>
                </div>
                <RangeField
                  label="Outline Width"
                  value={selectedLayer.outlineWidth}
                  min={0}
                  max={12}
                  step={0.5}
                  onChange={(value) => patchText(selectedLayer.id, { outlineWidth: value })}
                />
                <RangeField
                  label="Font Size"
                  value={selectedLayer.fontSize}
                  min={12}
                  max={140}
                  onChange={(value) => patchText(selectedLayer.id, { fontSize: value })}
                />
                <RangeField
                  label="Line Height"
                  value={selectedLayer.lineHeight}
                  min={0.8}
                  max={2}
                  step={0.05}
                  onChange={(value) => patchText(selectedLayer.id, { lineHeight: value })}
                />
                <label style={labelStyle}>
                  Align
                  <Dropdown
                    value={selectedLayer.align}
                    options={ALIGN_OPTIONS}
                    onChange={(value) =>
                      patchText(selectedLayer.id, { align: value as "left" | "center" | "right" })
                    }
                  />
                </label>
              </div>
            </AccordionRow>
          ) : (
            <AccordionRow label="Fill & Outline" isOpen={openSection === "fill"} onToggle={() => toggle("fill")}>
              <div style={{ display: "grid", gap: "8px" }}>
                <ColorField
                  label="Fill"
                  value={selectedLayer.fill}
                  onChange={(value) => onShapePatch(selectedLayer.id, { fill: value })}
                />
                <ColorField
                  label="Outline Color"
                  value={selectedLayer.borderColor}
                  onChange={(value) => onShapePatch(selectedLayer.id, { borderColor: value })}
                />
                <RangeField
                  label="Outline Width"
                  value={selectedLayer.borderWidth}
                  min={0}
                  max={12}
                  onChange={(value) => onShapePatch(selectedLayer.id, { borderWidth: value })}
                />
                <RangeField
                  label="Corner Radius"
                  value={selectedLayer.radius}
                  min={0}
                  max={60}
                  onChange={(value) => onShapePatch(selectedLayer.id, { radius: value })}
                />
              </div>
            </AccordionRow>
          )}

          <AccordionRow label="Effects" isOpen={openSection === "effects"} onToggle={() => toggle("effects")}>
            <RangeField
              label="Opacity"
              value={selectedLayer.opacity}
              min={0.1}
              max={1}
              step={0.05}
              onChange={(value) => onLayerPatch(selectedLayer.id, { opacity: value })}
            />
          </AccordionRow>
        </>
      )}
    </div>
  );
}

function styleOverwriteCount(layer: TemplateLayer) {
  const base = layer.type === "text" ? 8 : 4;
  return base;
}

function AccordionRow({
  label,
  isOpen,
  onToggle,
  children,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div style={{ borderBottom: "1px solid var(--border-base)" }}>
      <button type="button" onClick={onToggle} style={accordionHeaderStyle}>
        <span>{label}</span>
        <span style={{ color: "var(--fg-subtle)", fontSize: "11px" }}>{isOpen ? "−" : "+"}</span>
      </button>
      {isOpen ? <div style={{ padding: "10px 14px 14px" }}>{children}</div> : null}
    </div>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label style={labelStyle}>
      <span style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{label}</span>
        <span style={{ color: "var(--fg-subtle)" }}>{Math.round(value * 100) / 100}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const hasColor = Boolean(value);
  return (
    <label style={labelStyle}>
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
        <span>{label}</span>
        <button
          type="button"
          onClick={() => onChange("")}
          style={miniGhostButtonStyle}
          title="Clear color"
        >
          None
        </button>
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <input
          type="color"
          value={isHexColor(value) ? value : "#ffffff"}
          onChange={(event) => onChange(event.target.value)}
          style={colorInputStyle}
        />
        <span style={{ color: "var(--fg-subtle)", fontSize: "10px", fontFamily: "var(--font-mono)" }}>
          {hasColor ? value.toUpperCase() : "NONE"}
        </span>
      </div>
    </label>
  );
}

function isHexColor(value: string) {
  return /^#([A-Fa-f0-9]{6})$/.test(value);
}

const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 14px",
  borderBottom: "1px solid var(--border-base)",
};

const accordionHeaderStyle: CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  border: "none",
  background: "transparent",
  color: "var(--fg-base)",
  fontSize: "12px",
  fontWeight: 600,
  padding: "12px 14px",
  cursor: "pointer",
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: "4px",
  color: "var(--fg-muted)",
  fontSize: "11px",
};

const inputStyle: CSSProperties = {
  border: "1px solid var(--border-base)",
  background: "var(--bg-elevated)",
  color: "var(--fg-base)",
  borderRadius: "6px",
  padding: "6px 8px",
};

const colorInputStyle: CSSProperties = {
  width: "42px",
  height: "30px",
  border: "none",
  background: "transparent",
  cursor: "pointer",
};

const ghostButtonStyle: CSSProperties = {
  border: "1px solid var(--border-base)",
  background: "var(--bg-elevated)",
  color: "var(--fg-base)",
  borderRadius: "6px",
  padding: "8px 10px",
  fontSize: "11px",
  cursor: "pointer",
  textAlign: "center",
};

const quickStyleRowStyle: CSSProperties = {
  display: "grid",
  gap: "8px",
  padding: "10px",
  border: "1px solid var(--border-base)",
  borderRadius: "8px",
  background: "var(--bg-base)",
};

const quickStyleTitleStyle: CSSProperties = {
  color: "var(--fg-subtle)",
  fontFamily: "var(--font-mono)",
  fontSize: "10px",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
};

const quickStyleGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "8px",
};

const miniGhostButtonStyle: CSSProperties = {
  border: "1px solid var(--border-base)",
  background: "var(--bg-elevated)",
  color: "var(--fg-base)",
  borderRadius: "999px",
  padding: "2px 8px",
  fontSize: "10px",
  cursor: "pointer",
};
