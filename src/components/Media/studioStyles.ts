import type { CSSProperties } from "react";

export const modalBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1200,
  display: "grid",
  placeItems: "center",
  padding: 20,
  background: "var(--overlay-backdrop)",
};

export const modalSectionStyle: CSSProperties = {
  width: "min(1180px, 95vw)",
  height: "min(760px, 90vh)",
  maxHeight: "90vh",
  overflow: "hidden",
  padding: 24,
  border: "none",
  borderRadius: 12,
  background: "linear-gradient(145deg, var(--bg-surface), var(--bg-base))",
  boxShadow: "var(--shadow-lg)",
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr) auto",
  gap: 0,
};

export const modalHeaderRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

export const modalTitleStyle: CSSProperties = {
  margin: 0,
  color: "var(--fg-base)",
  fontSize: 18,
  fontWeight: 700,
  letterSpacing: "-0.01em",
};

export const studioStageStyle: CSSProperties = {
  width: "100%",
  aspectRatio: "16 / 9",
  minHeight: 280,
  border: "1px solid var(--border-base)",
  borderRadius: 10,
  background: "#171827",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.03), 0 10px 30px rgba(10, 8, 24, 0.18)",
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

export const studioWorkspaceStyle: CSSProperties = {
  minHeight: 0,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 300px",
  gap: 18,
  padding: "18px 0",
  overflow: "hidden",
};

export const studioCanvasColumnStyle: CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

export const studioInspectorStyle: CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  overflowY: "auto",
  padding: "2px 2px 2px 16px",
  borderLeft: "1px solid var(--border-base)",
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

export const studioFooterStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  paddingTop: 14,
  borderTop: "1px solid var(--border-base)",
};

export const modalCloseButtonStyle: CSSProperties = {
  width: 28,
  height: 28,
  border: "none",
  borderRadius: 6,
  background: "var(--bg-elevated)",
  color: "var(--fg-base)",
  cursor: "pointer",
  fontSize: 16,
  lineHeight: 1,
};

export const fieldLabelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  color: "var(--fg-muted)",
  fontSize: 12,
};

export const fieldInputStyle: CSSProperties = {
  padding: "8px 10px",
  border: "none",
  borderRadius: 6,
  background: "var(--bg-base)",
  color: "var(--fg-base)",
  fontSize: 13,
  outline: "none",
};

export const twoColumnGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

export const modalFooterRow: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  marginTop: 4,
};

export const secondaryButtonStyle: CSSProperties = {
  padding: "8px 14px",
  border: "none",
  borderRadius: 6,
  background: "var(--bg-elevated)",
  color: "var(--fg-base)",
  cursor: "pointer",
  fontSize: 12,
};

export const primaryButtonStyle: CSSProperties = {
  padding: "8px 14px",
  border: "none",
  borderRadius: 6,
  background: "var(--color-primary)",
  color: "var(--fg-on-accent)",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
};

export const toggleButtonStyle = (active: boolean): CSSProperties => ({
  padding: "6px 10px",
  border: "none",
  borderRadius: 6,
  background: active ? "var(--color-primary-muted)" : "var(--bg-elevated)",
  color: active ? "var(--color-primary)" : "var(--fg-muted)",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 600,
});

export const playButtonStyle: CSSProperties = {
  width: 34,
  height: 34,
  flexShrink: 0,
  display: "grid",
  placeItems: "center",
  border: "none",
  borderRadius: "50%",
  background: "var(--color-primary)",
  color: "var(--fg-on-accent)",
  cursor: "pointer",
  fontSize: 14,
};

export const sectionTitleStyle: CSSProperties = {
  color: "var(--fg-base)",
  fontWeight: 700,
  fontSize: 12,
  margin: "4px 0 -4px",
};
