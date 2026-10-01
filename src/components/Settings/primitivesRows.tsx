/** Settings primitives: labelled form rows (toggle, slider, select, text). */
import { useState } from "react";

import { IconEye, IconEyeOff } from "./icons";
import { inputStyle } from "./primitiveStyles";
import { Dropdown } from "./primitivesDropdown";
import { FieldLabel } from "./primitivesLayout";

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
