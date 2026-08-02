/**
 * Shared building blocks for the Auth gate.
 *
 * Form field styling (underline inputs) and button/icon composition follow
 * the reference zip's design language, but every color comes from this
 * app's own CSS custom properties (tokens.css) — no Tailwind, no imported
 * palette. Icons are the small inline SVG set in ./icons.tsx.
 */
import { useState, type CSSProperties, type ReactNode } from "react";

import { IconAlertCircle, IconCheckCircle, IconChevronDown, IconEye, IconEyeOff } from "./icons";

const underlineInputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "transparent",
  border: "none",
  borderBottom: "1px solid var(--border-base)",
  borderRadius: 0,
  color: "var(--fg-base)",
  fontSize: "var(--text-sm)",
  fontFamily: "var(--font-sans)",
  padding: "8px 2px",
  transition: "border-color 150ms ease",
};

export function AuthField({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <label
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--fg-subtle)",
        }}
      >
        {label}
        {required ? <span style={{ color: "var(--color-primary)" }}> *</span> : null}
      </label>
      {children}
      {hint ? <p style={{ margin: 0, fontSize: "10px", color: "var(--fg-subtle)" }}>{hint}</p> : null}
    </div>
  );
}

/**
 * Read-only "select" affordance for single-choice fields with exactly one
 * valid option (e.g. the parent denomination on a single-org internal
 * tool). Styled like a real dropdown trigger so the form reads the same as
 * a normal select, without pretending there's a real choice to make.
 */
export function LockedSelectField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <label
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--color-primary)",
        }}
      >
        {label} <span style={{ color: "var(--color-primary)" }}>*</span>
      </label>
      <div
        title="Only one network is available on this internal tool"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          width: "100%",
          boxSizing: "border-box",
          background: "transparent",
          borderBottom: "1px solid var(--border-base)",
          padding: "8px 2px",
          color: "var(--fg-base)",
          fontSize: "var(--text-sm)",
          fontFamily: "var(--font-sans)",
          cursor: "default",
        }}
      >
        <span>{value}</span>
        <span style={{ color: "var(--fg-subtle)", flexShrink: 0, display: "flex" }}>
          <IconChevronDown />
        </span>
      </div>
      {hint ? <p style={{ margin: 0, fontSize: "10px", color: "var(--fg-subtle)" }}>{hint}</p> : null}
    </div>
  );
}

export function TextLinkButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        outline: "none",
        padding: 0,
        color: "var(--color-primary)",
        fontFamily: "var(--font-mono)",
        fontSize: "10px",
        fontWeight: 700,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        textDecoration: "underline",
        textUnderlineOffset: "3px",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

export function AuthInput({
  value,
  onChange,
  type = "text",
  placeholder,
  autoFocus,
  mono,
  secret,
  uppercase,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  autoFocus?: boolean;
  mono?: boolean;
  secret?: boolean;
  uppercase?: boolean;
  required?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const [focused, setFocused] = useState(false);
  const resolvedType = secret ? (revealed ? "text" : "password") : type;

  return (
    <div style={{ position: "relative" }}>
      <input
        type={resolvedType}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        required={required}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)}
        style={{
          ...underlineInputStyle,
          outline: "none",
          borderBottomColor: focused ? "var(--color-primary)" : "var(--border-base)",
          fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
          letterSpacing: mono ? "0.04em" : "normal",
          paddingRight: secret ? "32px" : "2px",
        }}
      />
      {secret ? (
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          title={revealed ? "Hide password" : "Show password"}
          style={{
            position: "absolute",
            right: 0,
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            outline: "none",
            color: "var(--fg-subtle)",
            cursor: "pointer",
            display: "flex",
          }}
        >
          {revealed ? <IconEyeOff /> : <IconEye />}
        </button>
      ) : null}
    </div>
  );
}

export function AuthPrimaryButton({
  children,
  icon,
  trailingIcon,
  type = "submit",
  disabled,
  onClick,
  style,
}: {
  children: ReactNode;
  icon?: ReactNode;
  trailingIcon?: ReactNode;
  type?: "submit" | "button";
  disabled?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "10px",
        padding: "13px 20px",
        borderRadius: "var(--radius-md)",
        border: "none",
        outline: "none",
        background: disabled ? "var(--bg-elevated)" : "var(--color-primary)",
        color: disabled ? "var(--fg-subtle)" : "#fff",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-xs)",
        fontWeight: 700,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        cursor: disabled ? "default" : "pointer",
        transition: "background-color 150ms ease",
        boxShadow: disabled ? "none" : "var(--shadow-glow)",
        ...style,
      }}
    >
      {icon ? <span style={{ display: "flex" }}>{icon}</span> : null}
      <span>{children}</span>
      {trailingIcon ? <span style={{ display: "flex" }}>{trailingIcon}</span> : null}
    </button>
  );
}

export function AuthErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "8px",
        padding: "10px 12px",
        borderRadius: "var(--radius-md)",
        background: "rgba(239, 68, 68, 0.12)",
        fontSize: "11px",
        color: "var(--fg-muted)",
        lineHeight: 1.5,
      }}
    >
      <span style={{ color: "var(--color-error)", flexShrink: 0, display: "flex", marginTop: "1px" }}>
        <IconAlertCircle />
      </span>
      <span>
        <strong
          style={{
            display: "block",
            color: "var(--color-error)",
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Authentication Error
        </strong>
        {children}
      </span>
    </div>
  );
}

export function AuthSuccessBanner({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "8px",
        padding: "10px 12px",
        borderRadius: "var(--radius-md)",
        background: "rgba(34, 197, 94, 0.12)",
        fontSize: "11px",
        color: "var(--fg-muted)",
        lineHeight: 1.5,
      }}
    >
      <span style={{ color: "var(--color-success)", flexShrink: 0, display: "flex", marginTop: "1px" }}>
        <IconCheckCircle />
      </span>
      <span>{children}</span>
    </div>
  );
}
