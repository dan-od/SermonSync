// ─── Small shared primitives ──────────────────────────────────────────────────

export function tableHeaderCellStyle(isFirst?: boolean): React.CSSProperties {
  return {
    padding: "6px 12px",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--text-xs)",
    fontWeight: 600,
    letterSpacing: "0.08em",
    color: "var(--fg-muted)",
    whiteSpace: "nowrap",
    background: "var(--bg-elevated)",
    borderBottom: "1px solid var(--border-base)",
    borderRight: isFirst ? "1px solid var(--border-base)" : undefined,
    userSelect: "none",
  };
}

// ─── Songs tab ────────────────────────────────────────────────────────────────

export const addSongButtonStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  display: "grid",
  placeItems: "center",
  padding: 0,
  border: "1px solid var(--border-base)",
  borderRadius: "var(--radius-sm)",
  background: "var(--bg-elevated)",
  color: "var(--fg-base)",
  fontFamily: "var(--font-mono)",
  fontSize: 18,
  lineHeight: 1,
  cursor: "pointer",
  boxShadow: "var(--shadow-sm)",
  transition: "background 120ms ease, border-color 120ms ease, color 120ms ease",
};

export function slideActionButtonStyle(isActive: boolean): React.CSSProperties {
  return {
    border: "none",
    outline: "none",
    padding: "3px 7px",
    background: isActive ? "var(--color-primary)" : "var(--bg-elevated)",
    color: isActive ? "var(--fg-on-accent)" : "var(--fg-muted)",
    cursor: "pointer",
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    fontWeight: 700,
    whiteSpace: "nowrap",
  };
}

export const songContextMenuItemStyle: React.CSSProperties = {
  width: "100%",
  border: "none",
  background: "transparent",
  borderRadius: "6px",
  padding: "8px 10px",
  textAlign: "left",
  color: "var(--fg-base)",
  fontFamily: "var(--font-sans)",
  fontSize: "12px",
  cursor: "pointer",
};

export const deleteSongButton: React.CSSProperties = {
  padding: "8px 13px",
  border: "none",
  borderRadius: 6,
  background: "var(--color-error)",
  color: "var(--fg-on-accent)",
  cursor: "pointer",
  fontSize: 12,
};

// ─── Templates tab ────────────────────────────────────────────────────────────

export const renameSecondaryButton = { padding: "8px 13px", border: "none", borderRadius: 6, background: "var(--bg-elevated)", color: "var(--fg-base)", cursor: "pointer", fontSize: 12 };
export const renamePrimaryButton = { padding: "8px 13px", border: "none", borderRadius: 6, background: "var(--color-primary)", color: "var(--fg-on-accent)", cursor: "pointer", fontSize: 12 };
export const deleteTemplateButton = { padding: "8px 13px", border: "none", borderRadius: 6, background: "var(--color-error)", color: "white", cursor: "pointer", fontSize: 12 };
