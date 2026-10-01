import type { CSSProperties } from "react";

export const STUDIO_DEFAULT_STROKE = "#8c62ff";

export const SYSTEM_FONTS = ["Inter", "CMGSans", "Adwaita Sans", "Adwaita Mono", "Arial", "Cantarell", "Carlito", "Calibri", "Comfortaa", "Courier New", "Droid Sans", "FreeSans", "Georgia", "Liberation Mono", "Liberation Sans", "Liberation Serif", "Montserrat", "Noto Sans", "Noto Sans Arabic", "Noto Sans Bengali", "Noto Sans Devanagari", "Noto Sans Hebrew", "Noto Sans Japanese", "Noto Sans Math", "Noto Sans Mono", "Noto Serif", "Open Sans", "Red Hat Display", "Red Hat Text", "Roboto", "Source Code Pro", "Tahoma", "Times New Roman", "Ubuntu", "Verdana"].sort();
SYSTEM_FONTS.push("Inter, system-ui, sans-serif");

export const sectionTitle: CSSProperties = { color: "var(--color-primary)", fontWeight: 700, fontSize: "12px", margin: "8px 0" };
export const labelStyle: CSSProperties = { display: "grid", gap: "3px", color: "var(--fg-muted)", fontSize: "11px", marginBottom: "7px" };
export const inputStyle: CSSProperties = { width: "100%", boxSizing: "border-box", border: "none", borderRadius: "4px", background: "var(--bg-base)", color: "var(--fg-base)", padding: "6px", fontSize: "12px" };
export const filePickerStyle: CSSProperties = { position: "relative", display: "flex", alignItems: "center", gap: 5, width: "100%", minWidth: 0, boxSizing: "border-box", height: 29, padding: "3px 5px", border: "none", borderRadius: "4px", background: "var(--bg-base)", color: "var(--fg-base)", fontSize: "12px", overflow: "hidden" };
export const filePickerButtonStyle: CSSProperties = { flexShrink: 0, padding: "2px 5px", border: "none", borderRadius: "3px", background: "var(--bg-elevated)", color: "var(--fg-base)", fontSize: "11px", cursor: "pointer" };
export const shapeMediaPreview: CSSProperties = { width: "100%", aspectRatio: "16 / 7", overflow: "hidden", border: "1px solid var(--border-base)", borderRadius: "5px", background: "var(--bg-base)", marginBottom: "6px" };
export const shapeMediaPreviewMedia: CSSProperties = { width: "100%", height: "100%", display: "block", objectFit: "cover" };
export const mediaStatusRow: CSSProperties = { display: "flex", alignItems: "center", gap: "6px", minWidth: 0, marginBottom: "7px", color: "var(--fg-base)", fontSize: "11px" };
export const mediaFileName: CSSProperties = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--fg-subtle)" };
export const mediaActionRow: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "8px" };
export const mediaActionButton: CSSProperties = { border: "1px solid var(--border-base)", borderRadius: "4px", background: "var(--bg-base)", color: "var(--fg-base)", padding: "6px", cursor: "pointer", fontSize: "11px" };
export const removeMediaActionButton: CSSProperties = { ...mediaActionButton, borderColor: "color-mix(in srgb, var(--color-error) 60%, var(--border-base))", color: "var(--color-error)" };
export const noneColorButton: CSSProperties = { border: "none", borderRadius: "4px", background: "var(--bg-base)", color: "var(--fg-muted)", padding: "0 7px", fontSize: "10px", cursor: "pointer" };
export const removeMediaButton: CSSProperties = { width: 29, height: 29, flexShrink: 0, display: "grid", placeItems: "center", padding: 0, border: "1px solid var(--color-error)", borderRadius: "4px", background: "transparent", color: "var(--color-error)", cursor: "pointer", transition: "background 120ms ease, color 120ms ease" };
export const buttonRow: CSSProperties = { display: "flex", gap: "3px", marginBottom: "8px" };
export const toggleStyle = (active: boolean): CSSProperties => ({ flex: 1, border: "1px solid var(--border-base)", background: active ? "var(--color-primary-muted)" : "var(--bg-base)", color: active ? "var(--color-primary)" : "var(--fg-muted)", padding: "6px 2px", cursor: "pointer", fontSize: "10px" });
export const twoColumn: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 };
export const iconButtonRow: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 3 };
export const verticalAlignRow: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3, marginTop: 3 };
export const alignButtonStyle = (active: boolean): CSSProperties => ({ border: "1px solid var(--border-base)", background: active ? "var(--color-primary-muted)" : "var(--bg-base)", color: active ? "var(--color-primary)" : "var(--fg-muted)", fontSize: 20, padding: 6, cursor: "pointer" });
export const verticalAlignButtonStyle = alignButtonStyle;

export const iconBtn: CSSProperties = {
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

export const historyButton: CSSProperties = {
  width: "25px",
  height: "24px",
  padding: 0,
  border: "1px solid var(--border-base)",
  borderRadius: "4px",
  background: "var(--bg-elevated)",
  color: "var(--fg-base)",
  fontSize: "15px",
  lineHeight: 1,
  cursor: "pointer",
};
