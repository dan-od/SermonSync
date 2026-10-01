/** Settings primitives: radio-card group and chip editor. */
import { useState, type FormEvent } from "react";

import { inputStyle } from "./primitiveStyles";

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
