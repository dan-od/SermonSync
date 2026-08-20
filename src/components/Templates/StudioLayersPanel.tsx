import type { CSSProperties } from "react";

import type { TemplateLayer } from "../../types/templates";

interface StudioLayersPanelProps {
  layers: TemplateLayer[];
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onToggleLock: (layerId: string) => void;
  onMoveForward: (layerId: string) => void;
  onMoveBackward: (layerId: string) => void;
  onDelete: (layerId: string) => void;
  onDuplicate: (layerId: string) => void;
}

export function StudioLayersPanel({
  layers,
  selectedLayerId,
  onSelectLayer,
  onToggleVisibility,
  onToggleLock,
  onMoveForward,
  onMoveBackward,
  onDelete,
  onDuplicate,
}: StudioLayersPanelProps) {
  const ordered = [...layers].sort((a, b) => b.zIndex - a.zIndex);

  return (
    <div style={{ minHeight: 0, overflow: "auto", background: "var(--bg-surface)" }}>
      <div style={{ display: "grid" }}>
        {ordered.map((layer) => {
          const active = selectedLayerId === layer.id;
          return (
            <div
              key={layer.id}
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
                onClick={() => onSelectLayer(layer.id)}
                style={{
                  border: "none",
                  background: "transparent",
                  textAlign: "left",
                  cursor: "pointer",
                  color: active ? "var(--color-primary)" : "var(--fg-base)",
                  fontSize: "12px",
                  fontWeight: active ? 700 : 500,
                  padding: 0,
                  opacity: layer.visible ? 1 : 0.5,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {layer.name}
              </button>
              <div style={{ display: "flex", gap: "2px", flexShrink: 0 }}>
                <button type="button" onClick={() => onToggleVisibility(layer.id)} style={iconBtn} title={layer.visible ? "Hide" : "Show"}>
                  {layer.visible ? "👁" : "🚫"}
                </button>
                <button type="button" onClick={() => onToggleLock(layer.id)} style={iconBtn} title={layer.locked ? "Unlock" : "Lock"}>
                  {layer.locked ? "🔒" : "🔓"}
                </button>
                <button type="button" onClick={() => onMoveForward(layer.id)} style={iconBtn} title="Bring forward">↑</button>
                <button type="button" onClick={() => onMoveBackward(layer.id)} style={iconBtn} title="Send backward">↓</button>
                <button type="button" onClick={() => onDuplicate(layer.id)} style={iconBtn} title="Duplicate">⧉</button>
                <button type="button" onClick={() => onDelete(layer.id)} style={{ ...iconBtn, color: "var(--color-error)" }} title="Delete">✕</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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

