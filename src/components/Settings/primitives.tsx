/**
 * Shared building blocks for Settings tabs.
 *
 * Styled with the app's CSS custom properties (tokens.css) via inline style
 * objects — matching the pattern used across LocalLibraryPanel/AppLayout.
 * No Tailwind, no new global CSS.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { IconEye, IconEyeOff } from "./icons";

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

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--bg-elevated)",
  border: "none",
  borderRadius: "var(--radius-md)",
  color: "var(--fg-base)",
  fontSize: "var(--text-xs)",
  fontFamily: "var(--font-sans)",
  padding: "8px 10px",
  outline: "none",
};

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-3)",
        padding: "10px 12px",
        background: "var(--bg-base)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-base)" }}>{label}</p>
        {description ? (
          <p style={{ margin: "2px 0 0", fontSize: "10px", color: "var(--fg-subtle)" }}>{description}</p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          flexShrink: 0,
          position: "relative",
          width: "36px",
          height: "20px",
          borderRadius: "var(--radius-full)",
          border: "none",
          cursor: "pointer",
          background: checked ? "var(--color-primary)" : "var(--border-base)",
          transition: "background-color 150ms ease",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "2px",
            left: checked ? "18px" : "2px",
            width: "16px",
            height: "16px",
            borderRadius: "50%",
            background: "var(--fg-on-accent)",
            transition: "left 150ms ease",
          }}
        />
      </button>
    </div>
  );
}

export function SliderRow({
  label,
  description,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div
      style={{
        padding: "12px",
        background: "var(--bg-base)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-2)" }}>
        <div>
          <p style={{ margin: 0, fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-base)" }}>{label}</p>
          {description ? (
            <p style={{ margin: "2px 0 0", fontSize: "10px", color: "var(--fg-subtle)" }}>{description}</p>
          ) : null}
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--color-primary)", whiteSpace: "nowrap" }}>
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", marginTop: "10px", accentColor: "var(--color-primary)", cursor: "pointer" }}
      />
    </div>
  );
}

/**
 * Custom trigger + listbox dropdown, matching the pattern already used in
 * StatusBar.tsx's input-device picker (button toggles an option list that
 * closes on outside click). The listbox is portaled to document.body and
 * positioned with fixed coordinates so it's never clipped by a scrollable
 * or overflow:hidden ancestor (e.g. the Settings modal's scroll area).
 */
export function Dropdown({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const selected = options.find((opt) => opt.value === value);

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const bounds = trigger.getBoundingClientRect();
    setRect({ top: bounds.bottom + 6, left: bounds.left, width: bounds.width });
  };

  useLayoutEffect(() => {
    if (isOpen) updatePosition();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !listRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    const handleReposition = () => updatePosition();

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [isOpen]);

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        style={{
          ...inputStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected?.label ?? value}</span>
        <span style={{ color: "var(--fg-subtle)", flexShrink: 0 }}>⌄</span>
      </button>
      {isOpen && rect
        ? createPortal(
            <div
              ref={listRef}
              role="listbox"
              style={{
                position: "fixed",
                top: `${rect.top}px`,
                left: `${rect.left}px`,
                width: `${rect.width}px`,
                zIndex: 2000,
                maxHeight: "240px",
                overflowY: "auto",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-elevated)",
                boxShadow: "var(--shadow-md)",
                padding: "4px",
              }}
            >
              {options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                    }}
                    style={{
                      width: "100%",
                      border: "none",
                      outline: "none",
                      borderRadius: "6px",
                      background: isSelected ? "var(--color-primary-muted)" : "transparent",
                      color: isSelected ? "var(--fg-base)" : "var(--fg-muted)",
                      fontFamily: "var(--font-sans)",
                      fontSize: "var(--text-xs)",
                      padding: "8px 9px",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function SelectRow({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <Dropdown value={value} options={options} onChange={onChange} />
    </div>
  );
}

export function TextRow({
  label,
  hint,
  value,
  onChange,
  placeholder,
  secret,
  type = "text",
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  secret?: boolean;
  type?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const resolvedType = secret ? (revealed ? "text" : "password") : type;

  return (
    <div>
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <div style={{ position: "relative" }}>
        <input
          type={resolvedType}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...inputStyle, paddingRight: secret ? "36px" : "10px", fontFamily: "var(--font-mono)" }}
        />
        {secret ? (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            title={revealed ? "Hide" : "Show"}
            style={{
              position: "absolute",
              right: "8px",
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              color: "var(--fg-subtle)",
              cursor: "pointer",
              display: "flex",
            }}
          >
            {revealed ? <IconEyeOff /> : <IconEye />}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function RadioCardGroup<T extends string>({
  options,
  value,
  onChange,
  columns = 2,
}: {
  options: { value: T; label: string; description: string }[];
  value: T;
  onChange: (value: T) => void;
  columns?: number;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: "10px" }}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              textAlign: "left",
              padding: "10px 12px",
              borderRadius: "var(--radius-md)",
              border: active ? "1px solid var(--color-primary)" : "1px solid transparent",
              background: active ? "var(--color-primary-muted)" : "var(--bg-base)",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: active ? "var(--color-primary)" : "var(--fg-base)" }}>
                {opt.label}
              </span>
              <span
                style={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  border: active ? "1px solid var(--color-primary)" : "1px solid var(--fg-subtle)",
                  background: active ? "var(--color-primary)" : "transparent",
                  flexShrink: 0,
                }}
              />
            </div>
            <p style={{ margin: "4px 0 0", fontSize: "10px", color: "var(--fg-subtle)", lineHeight: 1.4 }}>{opt.description}</p>
          </button>
        );
      })}
    </div>
  );
}

export function ChipEditor({
  items,
  onAdd,
  onRemove,
  placeholder,
}: {
  items: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || items.includes(trimmed)) return;
    onAdd(trimmed);
    setDraft("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "6px",
          padding: "10px",
          background: "var(--bg-base)",
          borderRadius: "var(--radius-md)",
          minHeight: "40px",
        }}
      >
        {items.map((item) => (
          <span
            key={item}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "3px 8px",
              background: "var(--color-primary-muted)",
              color: "var(--color-primary)",
              borderRadius: "var(--radius-full)",
              fontSize: "10px",
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
            }}
          >
            {item}
            <button
              type="button"
              onClick={() => onRemove(item)}
              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontWeight: 700, lineHeight: 1 }}
            >
              ×
            </button>
          </span>
        ))}
        {items.length === 0 ? <span style={{ fontSize: "10px", color: "var(--fg-subtle)" }}>No groups yet.</span> : null}
      </div>
      <form onSubmit={submit} style={{ display: "flex", gap: "8px" }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          type="submit"
          style={{
            padding: "0 14px",
            borderRadius: "var(--radius-md)",
            border: "none",
            background: "var(--bg-elevated)",
            color: "var(--fg-base)",
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Add
        </button>
      </form>
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
