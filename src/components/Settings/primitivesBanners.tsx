/** Settings primitives: status pill and info banner. */
import type { ReactNode } from "react";

export function StatusPill({ tone, label }: { tone: "success" | "warning" | "error" | "neutral"; label: string }) {
  const styleMap: Record<string, { color: string; background: string }> = {
    success: { color: "var(--color-success)", background: "var(--color-success-muted)" },
    warning: { color: "var(--color-warning)", background: "var(--color-warning-muted)" },
    error: { color: "var(--color-error)", background: "var(--color-error-muted)" },
    neutral: { color: "var(--fg-subtle)", background: "var(--bg-elevated)" },
  };
  const { color, background } = styleMap[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: "3px 8px",
        borderRadius: "var(--radius-full)",
        background,
        color,
        fontFamily: "var(--font-mono)",
        fontSize: "9px",
        fontWeight: 700,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
      }}
    >
      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}

export function InfoBanner({ tone = "info", children }: { tone?: "info" | "warning"; children: ReactNode }) {
  const color = tone === "warning" ? "var(--color-warning)" : "var(--color-info)";
  const background = tone === "warning" ? "rgba(245, 158, 11, 0.12)" : "rgba(59, 130, 246, 0.12)";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "8px",
        padding: "10px 12px",
        borderRadius: "var(--radius-md)",
        background,
        fontSize: "10px",
        color: "var(--fg-muted)",
        lineHeight: 1.5,
      }}
    >
      <span style={{ color, flexShrink: 0 }}>●</span>
      <span>{children}</span>
    </div>
  );
}
