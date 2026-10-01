import type { ReactNode } from "react";

import { labelStyle, inputStyle, noneColorButton } from "./studioInspectorStyles";

export function InspectorField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  if (type === "color") {
    return <label style={labelStyle}>
      {label}
      <div style={{ display: "flex", gap: 4 }}>
        <input type="color" value={value || "#000000"} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, height: 29, padding: 2, flex: 1 }} />
        <button
          type="button"
          onClick={() => onChange("")}
          title={`Clear ${label.toLowerCase()}`}
          style={{ ...noneColorButton, opacity: value ? 1 : 0.55 }}
        >None</button>
      </div>
    </label>;
  }
  return <label style={labelStyle}>{label}<input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} /></label>;
}

export function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return <details style={{ border: "1px solid var(--border-base)", borderRadius: 6, marginBottom: 6 }}><summary style={{ cursor: "pointer", padding: 7, color: "var(--fg-base)", fontSize: 11, fontWeight: 700 }}>{title}</summary><div style={{ padding: 8 }}>{children}</div></details>;
}
