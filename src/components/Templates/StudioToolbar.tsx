import { useEffect, useRef, useState, type CSSProperties } from "react";

import type { StudioShapeKind } from "./FabricStudioCanvas";

interface StudioToolbarProps {
  onAddText: () => void;
  onAddShape: (kind: StudioShapeKind) => void;
  onAddMedia: () => void;
}

const SHAPE_GROUPS: Array<{ label: string; options: Array<{ kind: StudioShapeKind; label: string }> }> = [
  { label: "Basic", options: [{ kind: "rectangle", label: "Rectangle" }, { kind: "square", label: "Square" }, { kind: "circle", label: "Circle" }, { kind: "triangle", label: "Triangle" }] },
  { label: "Lines", options: [{ kind: "line", label: "Line" }, { kind: "arrow", label: "Arrow" }] },
  { label: "Decorative", options: [{ kind: "polygon", label: "Polygon" }, { kind: "star", label: "Star" }] },
];

export function StudioToolbar({ onAddText, onAddShape, onAddMedia }: StudioToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [shapesOpen, setShapesOpen] = useState(false);
  const [hoveredAddon, setHoveredAddon] = useState<string | null>(null);
  const [hoveredShapeGroup, setHoveredShapeGroup] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const closeMenus = () => {
    setMenuOpen(false);
    setShapesOpen(false);
    setHoveredAddon(null);
    setHoveredShapeGroup(null);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onWindowDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && rootRef.current?.contains(target)) return;
      closeMenus();
    };
    window.addEventListener("mousedown", onWindowDown);
    return () => window.removeEventListener("mousedown", onWindowDown);
  }, [menuOpen]);

  return (
    <div ref={rootRef} style={{ position: "absolute", right: "24px", bottom: "24px", zIndex: 5 }}>
      {menuOpen ? (
        <div style={menuStyle}>
          <button
            type="button"
            style={menuItemStyle(hoveredAddon === "textbox")}
            onMouseEnter={() => {
              setHoveredAddon("textbox");
              setShapesOpen(false);
              setHoveredShapeGroup(null);
            }}
            onClick={() => {
              onAddText();
              closeMenus();
            }}
          >
            Textbox
          </button>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={shapesOpen}
            style={menuItemStyle(shapesOpen || hoveredAddon === "shapes")}
            onMouseEnter={() => {
              setHoveredAddon("shapes");
              setShapesOpen(true);
            }}
            onClick={() => setShapesOpen((open) => !open)}
          >
            <span>Shapes</span><span aria-hidden="true">‹</span>
          </button>
          <button
            type="button"
            style={menuItemStyle(hoveredAddon === "media")}
            onMouseEnter={() => {
              setHoveredAddon("media");
              setShapesOpen(false);
              setHoveredShapeGroup(null);
            }}
            onClick={() => {
              onAddMedia();
              closeMenus();
            }}
          >
            Media
          </button>
          {shapesOpen ? (
            <div role="menu" aria-label="Shape categories" style={sideMenuStyle}>
              {SHAPE_GROUPS.map((group) => (
                <button
                  key={group.label}
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={hoveredShapeGroup === group.label}
                  style={menuItemStyle(hoveredShapeGroup === group.label)}
                  onMouseEnter={() => setHoveredShapeGroup(group.label)}
                  onClick={() => setHoveredShapeGroup((current) => current === group.label ? null : group.label)}
                >
                  <span>{group.label}</span><span aria-hidden="true">‹</span>
                </button>
              ))}
            </div>
          ) : null}
          {shapesOpen && hoveredShapeGroup ? (
            <div role="menu" aria-label={`${hoveredShapeGroup} shapes`} style={shapeOptionsMenuStyle}>
              {SHAPE_GROUPS.find((group) => group.label === hoveredShapeGroup)?.options.map((shape) => (
                <button
                  key={shape.kind}
                  type="button"
                  style={menuItemStyle(hoveredAddon === shape.kind)}
                  onMouseEnter={() => setHoveredAddon(shape.kind)}
                  onClick={() => {
                    onAddShape(shape.kind);
                    closeMenus();
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
          setMenuOpen((open) => !open);
          setShapesOpen(false);
          setHoveredAddon(null);
          setHoveredShapeGroup(null);
        }}
        style={fabStyle}
        title="Add layer"
      >
        +
      </button>
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

const menuStyle: CSSProperties = {
  position: "absolute",
  bottom: "56px",
  right: 0,
  display: "grid",
  gap: "4px",
  background: "var(--bg-elevated)",
  border: "none",
  borderRadius: "10px",
  padding: "6px",
  boxShadow: "var(--shadow-md)",
  minWidth: "120px",
};

const sideMenuStyle: CSSProperties = {
  position: "absolute",
  right: "calc(100% + 6px)",
  bottom: 0,
  display: "grid",
  gap: "3px",
  minWidth: "124px",
  padding: "6px",
  border: "none",
  borderRadius: "10px",
  background: "var(--bg-elevated)",
  boxShadow: "var(--shadow-md)",
};

const shapeOptionsMenuStyle: CSSProperties = {
  ...sideMenuStyle,
  right: "calc(200% + 12px)",
};

const menuItemStyle = (active = false): CSSProperties => ({
  border: "none",
  background: active ? "var(--color-primary-muted)" : "transparent",
  color: active ? "var(--color-primary)" : "var(--fg-base)",
  textAlign: "left",
  padding: "8px 10px",
  borderRadius: "6px",
  cursor: "pointer",
  fontSize: "12px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
});
