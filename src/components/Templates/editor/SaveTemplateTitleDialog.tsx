import type { TemplateCategory } from "../../../types/templates";
import { categoryLabel } from "./templateEditorLabels";

interface SaveTemplateTitleDialogProps {
  category: TemplateCategory;
  isSaving: boolean;
  titleDraft: string;
  setTitleDraft: (title: string) => void;
  titlePromptError: string | null;
  setTitlePromptError: (error: string | null) => void;
  setIsTitlePromptOpen: (open: boolean) => void;
  confirmTitleAndSave: () => void;
}

export function SaveTemplateTitleDialog({ category, isSaving, titleDraft, setTitleDraft, titlePromptError, setTitlePromptError, setIsTitlePromptOpen, confirmTitleAndSave }: SaveTemplateTitleDialogProps) {
  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) setIsTitlePromptOpen(false);
      }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        background: "color-mix(in srgb, var(--overlay-backdrop) 72%, transparent)",
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-template-title"
        onSubmit={(event) => {
          event.preventDefault();
          confirmTitleAndSave();
        }}
        style={{
          width: "min(400px, 100%)",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "12px",
          boxShadow: "var(--shadow-lg)",
          padding: "18px",
        }}
      >
        <div style={{ display: "grid", gap: "5px", marginBottom: "16px" }}>
          <div id="save-template-title" style={{ color: "var(--fg-base)", fontSize: "16px", fontWeight: 700 }}>
            Save template
          </div>
          <div style={{ color: "var(--fg-subtle)", fontSize: "12px", lineHeight: 1.45 }}>
            Give this {categoryLabel(category).toLowerCase()} template a name so you can find it later.
          </div>
        </div>
        <label style={{ display: "grid", gap: "6px", color: "var(--fg-muted)", fontSize: "11px", fontWeight: 700 }}>
          Template title
          <input
            autoFocus
            value={titleDraft}
            onChange={(event) => {
              setTitleDraft(event.target.value);
              if (titlePromptError) setTitlePromptError(null);
            }}
            placeholder={`New ${categoryLabel(category)} Template`}
            aria-invalid={Boolean(titlePromptError)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              border: `1px solid ${titlePromptError ? "var(--color-error)" : "var(--border-base)"}`,
              borderRadius: "7px",
              background: "var(--bg-elevated)",
              color: "var(--fg-base)",
              padding: "10px 11px",
              font: "inherit",
              fontSize: "13px",
              outline: "none",
            }}
          />
          {titlePromptError ? <span style={{ color: "var(--color-error)", fontSize: "11px", fontWeight: 500 }}>{titlePromptError}</span> : null}
        </label>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "18px" }}>
          <button
            type="button"
            onClick={() => setIsTitlePromptOpen(false)}
            disabled={isSaving}
            style={{ border: "1px solid var(--border-base)", background: "var(--bg-elevated)", color: "var(--fg-base)", borderRadius: "8px", padding: "8px 12px", cursor: isSaving ? "not-allowed" : "pointer" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            style={{ border: "none", background: isSaving ? "var(--bg-elevated)" : "var(--color-primary)", color: isSaving ? "var(--fg-subtle)" : "white", borderRadius: "8px", padding: "8px 12px", fontWeight: 700, cursor: isSaving ? "wait" : "pointer" }}
          >
            {isSaving ? "Saving..." : "Save template"}
          </button>
        </div>
      </form>
    </div>
  );
}
