import { useRef, useState } from "react";

import type { TemplateBackgroundMedia } from "../../../types/templates";
import { Dropdown } from "../../Settings/primitives";
import { InspectorField, InspectorSection } from "./StudioInspectorFields";
import { labelStyle, inputStyle, filePickerStyle, filePickerButtonStyle, removeMediaButton, buttonRow, toggleStyle, twoColumn } from "./studioInspectorStyles";

function mediaTypeFor(file: File): TemplateBackgroundMedia["type"] {
  if (file.type.startsWith("video/")) return "video";
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  return ["avi", "m4v", "mkv", "mov", "mp4", "ogv", "webm"].includes(extension) ? "video" : "image";
}

export function MediaBackgroundControls({ media, onChange }: { media: TemplateBackgroundMedia | null; onChange: (media: TemplateBackgroundMedia | null) => void }) {
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const [removeHovered, setRemoveHovered] = useState(false);
  const readMediaFile = (file: File, done: (media: TemplateBackgroundMedia) => void) => {
    // Data URLs are persisted with the template. Keep an accidental multi-hundred
    // megabyte video from exhausting the webview and blanking the application.
    if (file.size > 64 * 1024 * 1024) {
      window.alert("That media file is too large for a template background. Please choose a file smaller than 64 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => window.alert("The media file could not be read.");
    reader.onload = () => {
      const src = String(reader.result);
      const type = mediaTypeFor(file);
      // Keep selection immediate. ResilientVideo only invokes FFmpeg if the
      // webview actually rejects this video's codec/container at playback.
      done({ name: file.name, type, src, fit: "cover", loop: true, x: 0, y: 0, width: 100, height: 100, opacity: 1, muted: true, speed: 1 });
    };
    reader.readAsDataURL(file);
  };
  const patch = (changes: Partial<TemplateBackgroundMedia>) => media && onChange({ ...media, ...changes });
  if (!media) {
    return <label style={labelStyle}>Photo or video<input type="file" accept="image/*,video/*" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) readMediaFile(file, onChange); }} style={{ ...inputStyle, padding: "4px" }} /></label>;
  }
  return <>
    <div style={{ display: "flex", alignItems: "flex-end", gap: 5, marginBottom: 7 }}>
      <label style={{ ...labelStyle, flex: 1, minWidth: 0, marginBottom: 0 }}>
        Replace media
        <span style={filePickerStyle}>
          <button type="button" onClick={() => replaceInputRef.current?.click()} style={filePickerButtonStyle}>Choose File</button>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{media.name || "No file selected"}</span>
        </span>
      </label>
      <input ref={replaceInputRef} type="file" accept="image/*,video/*" aria-label="Replace media" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) readMediaFile(file, (next) => patch({ name: next.name, type: next.type, src: next.src })); }} style={{ display: "none" }} />
      <button type="button" onClick={() => onChange(null)} onMouseEnter={() => setRemoveHovered(true)} onMouseLeave={() => setRemoveHovered(false)} style={{ ...removeMediaButton, background: removeHovered ? "var(--color-error)" : "transparent", color: removeHovered ? "var(--fg-on-accent)" : "var(--color-error)" }} title="Remove media" aria-label="Remove media">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
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
