import { type ReactNode } from "react";

export function SectionIntro({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)" }}>
        <h2
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-xl)",
            fontWeight: 700,
            color: "var(--fg-base)",
            margin: 0,
          }}
        >
          {title}
        </h2>
        {action}
      </div>
      <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: "6px", lineHeight: 1.5 }}>
        {description}
      </p>
    </div>
  );
}

export function SettingsCard({
  icon,
  title,
  subtitle,
  badge,
  footer,
  children,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        style={{
          padding: "var(--space-3) var(--space-4)",
          background: "var(--bg-elevated)",
          borderTopLeftRadius: "var(--radius-lg)",
          borderTopRightRadius: "var(--radius-lg)",
          borderBottomLeftRadius: footer ? undefined : "var(--radius-lg)",
          borderBottomRightRadius: footer ? undefined : "var(--radius-lg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          {icon ? <span style={{ color: "var(--fg-muted)", display: "flex" }}>{icon}</span> : null}
          <div style={{ minWidth: 0 }}>
            <h3
              style={{
                margin: 0,
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-xs)",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--fg-base)",
              }}
            >
              {title}
            </h3>
            {subtitle ? (
              <p style={{ margin: "2px 0 0", fontSize: "10px", color: "var(--fg-subtle)" }}>{subtitle}</p>
            ) : null}
          </div>
        </div>
        {badge}
      </div>
      <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {children}
      </div>
      {footer ? (
        <div
          style={{
            padding: "var(--space-2) var(--space-4)",
            background: "var(--bg-elevated)",
            borderBottomLeftRadius: "var(--radius-lg)",
            borderBottomRightRadius: "var(--radius-lg)",
          }}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export function FieldLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: "6px" }}>
      <label
        style={{
          display: "block",
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--fg-subtle)",
        }}
      >
        {children}
      </label>
      {hint ? <p style={{ margin: "3px 0 0", fontSize: "10px", color: "var(--fg-subtle)" }}>{hint}</p> : null}
    </div>
  );
}

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
