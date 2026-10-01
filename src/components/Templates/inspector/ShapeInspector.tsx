import type { StudioFabricObjectData } from "../../../types/studioDocument";
import type { TemplateShapeImageFit } from "../../../types/templates";
import { Dropdown } from "../../Settings/primitives";
import { InspectorField, InspectorSection } from "./StudioInspectorFields";
import { STUDIO_DEFAULT_STROKE, sectionTitle, labelStyle, inputStyle, shapeMediaPreview, shapeMediaPreviewMedia, mediaStatusRow, mediaFileName, mediaActionRow, mediaActionButton, removeMediaActionButton, buttonRow, toggleStyle, twoColumn } from "./studioInspectorStyles";

export function ShapeInspector({ object, onUpdate, onSetMedia, onClearMedia }: { object: StudioFabricObjectData | undefined; onUpdate: (props: Record<string, unknown>) => void; onSetMedia?: (mediaType?: "image" | "video") => void; onClearMedia?: () => void }) {
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
        <div style={labelStyle}><span>Fill type</span><Dropdown value={shapeMediaSource ? shapeMediaType : "color"} options={[{ value: "color", label: "Color" }, { value: "image", label: "Image" }, { value: "video", label: "Video" }]} onChange={(fillType) => {
          if (fillType === "image" || fillType === "video") onSetMedia?.(fillType);
          else onClearMedia?.();
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
      ) : (
        <InspectorField label="Fill color" type="color" value={value("fill", "#101319")} onChange={(fill) => onUpdate({ fill })} />
      )}
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
