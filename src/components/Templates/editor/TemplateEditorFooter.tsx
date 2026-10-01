interface TemplateEditorFooterProps {
  saveError: string | null;
  isSaving: boolean;
  onClose: () => void;
  requestSave: () => void;
}

export function TemplateEditorFooter({ saveError, isSaving, onClose, requestSave }: TemplateEditorFooterProps) {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--border-base)",
        padding: "10px 14px",
        display: "flex",
        justifyContent: "flex-end",
        gap: "8px",
        background: "var(--bg-surface)",
      }}
    >
      {saveError ? <span style={{ marginRight: "auto", alignSelf: "center", color: "var(--color-error)", fontSize: "12px" }}>{saveError}</span> : null}
      <button
        type="button"
        onClick={onClose}
        style={{ border: "1px solid var(--border-base)", background: "var(--bg-elevated)", color: "var(--fg-base)", borderRadius: "8px", padding: "8px 12px", cursor: "pointer" }}
      >
        Close
      </button>
      <button
        type="button"
        onClick={requestSave}
        disabled={isSaving}
        style={{ border: "none", background: isSaving ? "var(--bg-elevated)" : "var(--color-primary)", color: isSaving ? "var(--fg-subtle)" : "white", borderRadius: "8px", padding: "8px 12px", fontWeight: 700, cursor: isSaving ? "wait" : "pointer" }}
      >
        {isSaving ? "Saving..." : "Save Template"}
      </button>
    </footer>
  );
}
