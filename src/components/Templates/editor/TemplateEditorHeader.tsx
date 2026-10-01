import type { TemplateCategory } from "../../../types/templates";
import { categoryLabel } from "./templateEditorLabels";

interface TemplateEditorHeaderProps {
  mode: "create" | "edit";
  category: TemplateCategory;
  onClose: () => void;
}

export function TemplateEditorHeader({ mode, category, onClose }: TemplateEditorHeaderProps) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "10px",
        borderBottom: "1px solid var(--border-base)",
        padding: "10px 14px",
        background: "var(--bg-surface)",
      }}
    >
      <div style={{ display: "grid", gap: "2px" }}>
        <span style={{ color: "var(--fg-base)", fontWeight: 700, fontSize: "14px" }}>
          {mode === "edit" ? "Edit Template" : "Create Template"}
        </span>
        <span style={{ color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.06em" }}>
          {categoryLabel(category).toUpperCase()} · CANVAS AUTHORING
        </span>
      </div>
      <button
        type="button"
        onClick={onClose}
        style={{ border: "none", background: "var(--bg-elevated)", color: "var(--fg-base)", borderRadius: "6px", width: "28px", height: "28px", cursor: "pointer" }}
        title="Close"
      >
        ×
      </button>
    </header>
  );
}
