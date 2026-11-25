import { useState } from "react";
import { createPortal } from "react-dom";

import { filtersToCss, flipTransform } from "../../lib/mediaFilters";
import type { ImageMediaSettings } from "../../types/media";
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
  toggleButtonStyle,
  twoColumnGrid,
} from "./studioStyles";

interface ImageStudioModalProps {
  open: boolean;
  name: string;
  src: string;
  settings: ImageMediaSettings;
  onClose: () => void;
  onSave: (name: string, settings: ImageMediaSettings) => void;
}

export function ImageStudioModal({ open, name, src, settings, onClose, onSave }: ImageStudioModalProps) {
  const [title, setTitle] = useState(name);
  const [local, setLocal] = useState<ImageMediaSettings>(settings);

  if (!open) return null;

  return createPortal(
    <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} style={modalBackdropStyle}>
      <section role="dialog" aria-modal="true" aria-labelledby="image-studio-title" style={modalSectionStyle}>
        <div style={modalHeaderRow}>
          <h2 id="image-studio-title" style={modalTitleStyle}>Image Studio</h2>
          <button type="button" onClick={onClose} title="Close" style={modalCloseButtonStyle}>×</button>
        </div>

        <label style={fieldLabelStyle}>
          Name
          <input value={title} onChange={(event) => setTitle(event.target.value)} style={fieldInputStyle} />
        </label>

        <div
          style={{
            width: "100%",
            aspectRatio: "16 / 9",
            borderRadius: 8,
            border: "1px solid var(--border-base)",
            background: "var(--bg-base)",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <img
            src={src}
            alt={title}
            style={{
              width: "100%",
              height: "100%",
              objectFit: local.fit,
              opacity: local.opacity,
              filter: filtersToCss(local.filters),
              transform: flipTransform(local.flipX, local.flipY),
            }}
          />
        </div>

        <div style={twoColumnGrid}>
          <label style={fieldLabelStyle}>
            Fit
            <Dropdown
              value={local.fit}
              options={[
                { value: "cover", label: "Cover" },
                { value: "contain", label: "Contain" },
                { value: "fill", label: "Fill" },
              ]}
              onChange={(fit) => setLocal({ ...local, fit: fit as ImageMediaSettings["fit"] })}
              triggerStyle={fieldInputStyle}
            />
          </label>
          <label style={fieldLabelStyle}>
            Opacity ({Math.round(local.opacity * 100)}%)
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={local.opacity}
              onChange={(event) => setLocal({ ...local, opacity: Number(event.target.value) })}
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" style={toggleButtonStyle(local.flipX)} onClick={() => setLocal({ ...local, flipX: !local.flipX })}>Flip horizontally</button>
          <button type="button" style={toggleButtonStyle(local.flipY)} onClick={() => setLocal({ ...local, flipY: !local.flipY })}>Flip vertically</button>
        </div>

        <div style={sectionTitleStyle}>Filters</div>
        <MediaFiltersPanel filters={local.filters} onChange={(filters) => setLocal({ ...local, filters })} />

        <div style={modalFooterRow}>
          <button type="button" onClick={onClose} style={secondaryButtonStyle}>Cancel</button>
          <button type="button" onClick={() => onSave(title.trim() || name, local)} style={primaryButtonStyle}>Save</button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
