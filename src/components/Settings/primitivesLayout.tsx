/** Settings primitives: section intro, card shell and field label. */
import type { ReactNode } from "react";

export function SectionIntro({ title, description }: { title: string; description: string }) {
  return (
    <div>
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
