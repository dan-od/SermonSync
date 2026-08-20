import { useEffect, useRef, useState, type CSSProperties } from "react";

import type { TemplateShapeKind } from "../../types/templates";

interface StudioToolbarProps {
  onAddTextbox: () => void;
  onChooseShape: (shapeKind: TemplateShapeKind) => void;
  onDuplicateSelected: () => void;
  hasSelection: boolean;
}

const SHAPE_OPTIONS: Array<{ kind: TemplateShapeKind; label: string }> = [
  { kind: "circle", label: "Circle" },
  { kind: "rectangle", label: "Rectangle" },
  { kind: "square", label: "Square" },
  { kind: "triangle", label: "Triangle" },
];

export function StudioToolbar({ onAddTextbox, onChooseShape, onDuplicateSelected, hasSelection }: StudioToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [shapesOpen, setShapesOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const onWindowDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && rootRef.current?.contains(target)) {
        return;
      }
      setMenuOpen(false);
      setShapesOpen(false);
    };

    window.addEventListener("mousedown", onWindowDown);
    return () => window.removeEventListener("mousedown", onWindowDown);
  }, [menuOpen]);

  return (
    <div style={{ position: "absolute", right: "24px", bottom: "24px", display: "flex", alignItems: "center", gap: "10px", zIndex: 5 }}>
      {hasSelection ? (
        <button type="button" onClick={onDuplicateSelected} style={pillButtonStyle} title="Duplicate selected layer">
          ⧉
        </button>
      ) : null}

      <div ref={rootRef} style={{ position: "relative" }}>
        {menuOpen ? (
          <div style={menuStyle}>
            <button
              type="button"
              style={menuItemStyle}
              onClick={() => {
                onAddTextbox();
                setMenuOpen(false);
                setShapesOpen(false);
              }}
            >
              Textbox
            </button>
            <button
              type="button"
              style={menuItemStyle}
              onClick={() => {
                setShapesOpen((open) => !open);
              }}
            >
              Shapes
            </button>

            {shapesOpen ? (
              <div style={submenuStyle}>
                {SHAPE_OPTIONS.map((shape) => (
                  <button
                    key={shape.kind}
                    type="button"
                    style={menuItemStyle}
                    onClick={() => {
                      onChooseShape(shape.kind);
                      setMenuOpen(false);
                      setShapesOpen(false);
                    }}
                  >
                    {shape.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setMenuOpen((open) => {
              const next = !open;
              if (!next) {
                setShapesOpen(false);
              }
              return next;
            });
          }}
          style={fabStyle}
          title="Add layer"
        >
          +
        </button>
      </div>
    </div>
  );
}

const fabStyle: CSSProperties = {
  width: "48px",
  height: "48px",
  borderRadius: "50%",
  border: "none",
  background: "var(--color-primary)",
  color: "white",
  fontSize: "24px",
  lineHeight: 1,
  cursor: "pointer",
  boxShadow: "var(--shadow-md)",
};

const pillButtonStyle: CSSProperties = {
  width: "36px",
  height: "36px",
  borderRadius: "50%",
  border: "1px solid var(--border-base)",
  background: "var(--bg-elevated)",
  color: "var(--fg-base)",
  cursor: "pointer",
  boxShadow: "var(--shadow-sm)",
};

const menuStyle: CSSProperties = {
  position: "absolute",
  bottom: "56px",
  right: 0,
  display: "grid",
  gap: "4px",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-base)",
  borderRadius: "10px",
  padding: "6px",
  boxShadow: "var(--shadow-md)",
  minWidth: "120px",
};

const submenuStyle: CSSProperties = {
  borderTop: "1px solid var(--border-base)",
  marginTop: "2px",
  paddingTop: "4px",
  display: "grid",
  gap: "3px",
};

const menuItemStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "var(--fg-base)",
  textAlign: "left",
  padding: "8px 10px",
  borderRadius: "6px",
  cursor: "pointer",
  fontSize: "12px",
};
