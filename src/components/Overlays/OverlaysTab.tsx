import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useOverlayStore } from "../../stores/overlayStore";
import { useProjectorStore } from "../../stores/projectorStore";
import { createOverlayDraft, type OverlayDefinition, type OverlayKind } from "../../types/overlays";
import { OverlayStage, OverlayVisual } from "./OverlayVisual";
import { OverlayStudioModal } from "./OverlayStudioModal";

const menuButtonStyle: React.CSSProperties = {
  display: "block", width: "100%", border: 0, borderRadius: 6, padding: "8px 10px",
  background: "transparent", color: "var(--fg-base)", textAlign: "left", cursor: "pointer", fontSize: 12,
};
const secondaryButtonStyle: React.CSSProperties = { border: 0, borderRadius: 6, padding: "8px 12px", background: "var(--bg-elevated)", color: "var(--fg-base)", cursor: "pointer" };
const primaryButtonStyle: React.CSSProperties = { border: 0, borderRadius: 6, padding: "8px 12px", background: "var(--color-primary)", color: "white", cursor: "pointer", fontWeight: 700 };

export function OverlaysTab() {
  const overlays = useOverlayStore((state) => state.overlays);
  const upsert = useOverlayStore((state) => state.upsert);
  const rename = useOverlayStore((state) => state.rename);
  const remove = useOverlayStore((state) => state.remove);
  const activeOverlays = useProjectorStore((state) => state.activeOverlays);
  const toggleOverlay = useProjectorStore((state) => state.toggleOverlay);
  const [studioOverlay, setStudioOverlay] = useState<OverlayDefinition | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | OverlayKind>("all");
  const [hoveredAction, setHoveredAction] = useState<"edit" | "rename" | "delete" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => overlays.find((entry) => entry.id === menu?.id), [menu, overlays]);
  const deleteTarget = overlays.find((entry) => entry.id === deleteId);
  const visibleOverlays = useMemo(() => overlays.filter((entry) => filter === "all" || entry.kind === filter), [filter, overlays]);

  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setMenu(null); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", escape); };
  }, [menu]);

  return (
    <div style={{ height: "100%", display: "flex", background: "var(--bg-base)" }}>
      <div style={{ width: 220, flexShrink: 0, position: "relative", borderRight: "1px solid var(--border-base)", background: "var(--bg-base)" }}>
        <div style={{ padding: "10px 13px", borderBottom: "1px solid var(--border-base)", background: "var(--bg-elevated)", color: "var(--fg-muted)", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, letterSpacing: ".06em" }}>Overlays</div>
        {([ ["all", "All Overlays"], ["timer", "Timers"], ["alert", "Quick Alerts"], ["name", "Names"], ["watermark", "Watermarks"], ["custom", "Custom"] ] as const).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "9px 12px", border: 0, borderLeft: filter === id ? "2px solid var(--color-primary)" : "2px solid transparent", background: filter === id ? "var(--color-primary-muted)" : "transparent", color: filter === id ? "var(--color-primary)" : "var(--fg-base)", textAlign: "left", cursor: "pointer", fontSize: 12 }}><span>{label}</span><strong>{id === "all" ? overlays.length : overlays.filter((entry) => entry.kind === id).length}</strong></button>
        ))}
        <button type="button" aria-label="Add overlay" title="Open Overlay Canvas Studio" onClick={() => setStudioOverlay(createOverlayDraft(filter === "all" ? "custom" : filter))} style={{ position: "absolute", right: 16, bottom: 16, width: 31, height: 31, border: 0, borderRadius: 7, background: "var(--color-primary-muted)", color: "var(--color-primary)", fontSize: 21, cursor: "pointer" }}>+</button>
      </div>
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border-base)", background: "var(--bg-elevated)", color: "var(--fg-muted)", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, letterSpacing: ".06em", display: "flex", justifyContent: "space-between", gap: 10 }}><span>{filter === "all" ? "Overlay Gallery" : filter === "timer" ? "Timer Gallery" : filter === "alert" ? "Quick Alert Gallery" : filter === "name" ? "Name Gallery" : filter === "watermark" ? "Watermark Gallery" : "Custom Gallery"}</span><span style={{ fontSize: 10, letterSpacing: 0 }}>One LIVE overlay at a time</span></div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 14 }}>
        {visibleOverlays.length === 0 ? (
          <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--fg-subtle)", fontSize: 12 }}>No overlays yet. Use + to build one in the canvas studio.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(185px, 210px))", gap: 12 }}>
            {visibleOverlays.map((overlay) => {
              const active = activeOverlays.at(-1)?.definition.id === overlay.id;
              return (
                <button
                  key={overlay.id}
                  type="button"
                  aria-pressed={active}
                  aria-label={`${active ? "Hide" : "Show"} ${overlay.name} on LIVE`}
                  onClick={() => toggleOverlay(overlay)}
                  onContextMenu={(event) => { event.preventDefault(); setHoveredAction(null); setMenu({ id: overlay.id, x: event.clientX, y: event.clientY }); }}
                  style={{ minWidth: 0, padding: 0, border: active ? "1px solid var(--color-primary)" : "1px solid var(--border-base)", borderRadius: 9, background: "var(--bg-elevated)", overflow: "hidden", textAlign: "left", cursor: "pointer", boxShadow: "var(--shadow-sm)" }}
                >
                  <OverlayStage><OverlayVisual overlay={overlay} /></OverlayStage>
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 10px" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--fg-base)", fontSize: 12, fontWeight: 700 }}>{overlay.name}</span>
                    <span style={{ flexShrink: 0, color: active ? "var(--color-primary)" : "var(--fg-muted)", fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 700 }}>{active ? "LIVE" : overlay.kind.toUpperCase()}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        </div>
      </div>

      {menu && selected ? (
        <div ref={menuRef} role="menu" style={{ position: "fixed", left: Math.max(0, Math.min(menu.x, window.innerWidth - 170)), top: Math.max(0, Math.min(menu.y, window.innerHeight - 130)), width: 160, padding: 4, borderRadius: 8, background: "var(--bg-surface)", boxShadow: "var(--shadow-lg)", zIndex: 1200 }}>
          <button type="button" role="menuitem" onMouseEnter={() => setHoveredAction("edit")} onMouseLeave={() => setHoveredAction(null)} onClick={() => { setStudioOverlay(selected); setMenu(null); }} style={{ ...menuButtonStyle, background: hoveredAction === "edit" ? "var(--color-primary-muted)" : "transparent" }}>Edit</button>
          <button type="button" role="menuitem" onMouseEnter={() => setHoveredAction("rename")} onMouseLeave={() => setHoveredAction(null)} onClick={() => { setRenameId(selected.id); setRenameValue(selected.name); setMenu(null); }} style={{ ...menuButtonStyle, background: hoveredAction === "rename" ? "var(--color-primary-muted)" : "transparent" }}>Rename</button>
          <button type="button" role="menuitem" onMouseEnter={() => setHoveredAction("delete")} onMouseLeave={() => setHoveredAction(null)} onClick={() => { setDeleteId(selected.id); setMenu(null); }} style={{ ...menuButtonStyle, color: "var(--color-error)", background: hoveredAction === "delete" ? "var(--color-error-muted)" : "transparent" }}>Delete</button>
        </div>
      ) : null}

      {renameId ? createPortal(
        <div role="presentation" style={{ position: "fixed", inset: 0, zIndex: 1300, background: "var(--overlay-backdrop)", display: "grid", placeItems: "center" }}>
          <section role="dialog" aria-modal="true" aria-label="Rename overlay" style={{ width: "min(400px, 90vw)", padding: 18, borderRadius: 9, background: "var(--bg-surface)", color: "var(--fg-base)", display: "grid", gap: 12 }}>
            <strong>Rename overlay</strong>
            <input aria-label="Overlay name" autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && renameValue.trim()) { rename(renameId, renameValue); setRenameId(null); } if (event.key === "Escape") setRenameId(null); }} style={{ padding: 9, border: "1px solid var(--border-base)", borderRadius: 6, background: "var(--bg-elevated)", color: "var(--fg-base)" }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><button type="button" onClick={() => setRenameId(null)} style={secondaryButtonStyle}>Cancel</button><button type="button" disabled={!renameValue.trim()} onClick={() => { rename(renameId, renameValue); setRenameId(null); }} style={{ ...primaryButtonStyle, opacity: renameValue.trim() ? 1 : 0.5 }}>Save</button></div>
          </section>
        </div>, document.body,
      ) : null}

      {deleteTarget ? createPortal(
        <div role="presentation" style={{ position: "fixed", inset: 0, zIndex: 1300, background: "var(--overlay-backdrop)", display: "grid", placeItems: "center" }}>
          <section role="alertdialog" aria-modal="true" aria-label="Delete overlay" style={{ width: "min(400px, 90vw)", padding: 18, borderRadius: 9, background: "var(--bg-surface)", color: "var(--fg-base)", display: "grid", gap: 12 }}>
            <strong>Delete {deleteTarget.name}?</strong>
            <span style={{ color: "var(--fg-muted)", fontSize: 12 }}>This removes the overlay from the library and LIVE output.</span>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><button type="button" onClick={() => setDeleteId(null)} style={secondaryButtonStyle}>Cancel</button><button type="button" onClick={() => { remove(deleteTarget.id); setDeleteId(null); }} style={{ ...primaryButtonStyle, background: "var(--color-error)" }}>Delete</button></div>
          </section>
        </div>, document.body,
      ) : null}

      {studioOverlay ? <OverlayStudioModal key={studioOverlay.id} initial={studioOverlay} onClose={() => setStudioOverlay(null)} onSave={(overlay) => { const saved = upsert(overlay); if (saved) setStudioOverlay(null); return saved; }} /> : null}
    </div>
  );
}
