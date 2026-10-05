import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { filtersToCss, flipTransform } from "../../lib/mediaFilters";
import type { ImageMediaSettings } from "../../types/media";
import { ResilientImage } from "../ResilientImage";
import { Dropdown } from "../Settings/primitives";
import { MediaFiltersPanel } from "./MediaFiltersPanel";
import {
  fieldInputStyle,
  fieldLabelStyle,
  modalBackdropStyle,
  modalCloseButtonStyle,
  modalFooterRow,
  modalHeaderRow,
  modalSectionStyle,
  modalTitleStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  sectionTitleStyle,
  studioCanvasColumnStyle,
  studioFooterStyle,
  studioInspectorStyle,
  studioStageStyle,
  studioWorkspaceStyle,
  toggleButtonStyle,
} from "./studioStyles";

interface ImageStudioModalProps {
  open: boolean;
  name: string;
  src: string;
  sourcePath: string;
  settings: ImageMediaSettings;
  onClose: () => void;
  onSave: (name: string, settings: ImageMediaSettings) => void;
}

export function ImageStudioModal({ open, name, src, sourcePath, settings, onClose, onSave }: ImageStudioModalProps) {
  const [title, setTitle] = useState(name);
  const [local, setLocal] = useState<ImageMediaSettings>(settings);

  useEffect(() => {
    if (!open) return;
    setTitle(name);
    setLocal(settings);
  }, [open, name, settings]);

  if (!open) return null;

  return createPortal(
    <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} style={modalBackdropStyle}>
      <section className="studio-modal" role="dialog" aria-modal="true" aria-labelledby="image-studio-title" style={modalSectionStyle}>
        <div style={modalHeaderRow}>
          <div>
            <h2 id="image-studio-title" style={modalTitleStyle}>Image Canvas Studio</h2>
            <div style={{ marginTop: 4, color: "var(--fg-subtle)", fontSize: 11 }}>Shape the visual before it reaches the projector.</div>
          </div>
          <button type="button" onClick={onClose} title="Close" style={modalCloseButtonStyle}>×</button>
        </div>

        <div style={studioWorkspaceStyle}>
          <div style={studioCanvasColumnStyle}>
            <label style={fieldLabelStyle}>
              Asset name
              <input value={title} onChange={(event) => setTitle(event.target.value)} style={fieldInputStyle} />
            </label>
            <div style={{ ...studioStageStyle, flex: 1, minHeight: 0 }}>
              <ResilientImage src={src} sourcePath={sourcePath} alt={title} style={{ width: "100%", height: "100%", objectFit: local.fit, opacity: local.opacity, filter: filtersToCss(local.filters), transform: flipTransform(local.flipX, local.flipY) }} />
            </div>
            <div style={{ color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.05em" }}>CANVAS PREVIEW / 16:9 OUTPUT</div>
          </div>
          <aside className="studio-scroll-pane" style={studioInspectorStyle}>
            <div style={sectionTitleStyle}>LAYOUT</div>
            <label style={fieldLabelStyle}>
              Fit
              <Dropdown value={local.fit} options={[{ value: "cover", label: "Cover" }, { value: "contain", label: "Contain" }, { value: "fill", label: "Fill" }]} onChange={(fit) => setLocal({ ...local, fit: fit as ImageMediaSettings["fit"] })} triggerStyle={fieldInputStyle} />
            </label>
            <label style={fieldLabelStyle}>Opacity ({Math.round(local.opacity * 100)}%)<input type="range" min={0} max={1} step={0.01} value={local.opacity} onChange={(event) => setLocal({ ...local, opacity: Number(event.target.value) })} /></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <button type="button" style={toggleButtonStyle(local.flipX)} onClick={() => setLocal({ ...local, flipX: !local.flipX })}>Flip X</button>
              <button type="button" style={toggleButtonStyle(local.flipY)} onClick={() => setLocal({ ...local, flipY: !local.flipY })}>Flip Y</button>
            </div>
            <div style={sectionTitleStyle}>FILTERS</div>
            <MediaFiltersPanel filters={local.filters} onChange={(filters) => setLocal({ ...local, filters })} />
          </aside>
        </div>

        <div style={studioFooterStyle}>
          <span style={{ color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", fontSize: 10 }}>IMAGE ASSET</span>
          <div style={modalFooterRow}>
          <button type="button" onClick={onClose} style={secondaryButtonStyle}>Cancel</button>
          <button type="button" onClick={() => onSave(title.trim() || name, local)} style={primaryButtonStyle}>Save</button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
