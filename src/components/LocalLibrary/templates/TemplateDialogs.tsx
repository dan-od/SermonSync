import { createPortal } from "react-dom";

import type { useTemplateStore } from "../../../stores/templateStore";
import { deleteTemplateButton, renamePrimaryButton, renameSecondaryButton } from "../styles";

export function RenameTemplateDialog({
  renameTargetTemplate,
  renameValue,
  setRenameValue,
  closeRename,
  confirmRename,
}: {
  renameTargetTemplate: ReturnType<typeof useTemplateStore.getState>["templates"][number];
  renameValue: string;
  setRenameValue: (value: string) => void;
  closeRename: () => void;
  confirmRename: () => Promise<void>;
}) {
  return createPortal(
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeRename();
      }}
      style={{ position: "fixed", inset: 0, zIndex: 100, display: "grid", placeItems: "center", padding: 20, background: "rgba(8, 9, 14, 0.58)" }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="rename-template-title" style={{ width: "min(420px, 100%)", boxSizing: "border-box", padding: 18, border: "1px solid var(--border-base)", borderRadius: 10, background: "var(--bg-surface)", boxShadow: "var(--shadow-lg)" }}>
        <h2 id="rename-template-title" style={{ margin: 0, color: "var(--fg-base)", fontSize: 16 }}>Rename template</h2>
        <p style={{ margin: "6px 0 14px", color: "var(--fg-muted)", fontSize: 12 }}>{renameTargetTemplate.name}</p>
        <input
          autoFocus
          value={renameValue}
          onChange={(event) => setRenameValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void confirmRename();
            if (event.key === "Escape") closeRename();
          }}
          aria-label="Template name"
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 11px", border: "none", borderRadius: 6, outline: "2px solid var(--color-primary)", background: "var(--bg-base)", color: "var(--fg-base)", fontSize: 13 }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button type="button" onClick={closeRename} style={renameSecondaryButton}>Cancel</button>
          <button type="button" onClick={() => void confirmRename()} disabled={!renameValue.trim()} style={{ ...renamePrimaryButton, opacity: renameValue.trim() ? 1 : 0.5 }}>Rename</button>
        </div>
      </section>
    </div>,
    globalThis.document.body,
  );
}

export function DeleteTemplateDialog({
  deleteTargetTemplate,
  closeDeleteConfirmation,
  confirmDelete,
}: {
  deleteTargetTemplate: ReturnType<typeof useTemplateStore.getState>["templates"][number];
  closeDeleteConfirmation: () => void;
  confirmDelete: () => Promise<void>;
}) {
  return createPortal(
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeDeleteConfirmation();
      }}
      style={{ position: "fixed", inset: 0, zIndex: 100, display: "grid", placeItems: "center", padding: 20, background: "rgba(8, 9, 14, 0.58)" }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="delete-template-title" aria-describedby="delete-template-description" style={{ width: "min(420px, 100%)", boxSizing: "border-box", padding: 18, border: "1px solid var(--border-base)", borderRadius: 10, background: "var(--bg-surface)", boxShadow: "var(--shadow-lg)" }}>
        <h2 id="delete-template-title" style={{ margin: 0, color: "var(--fg-base)", fontSize: 16 }}>Delete template?</h2>
        <p id="delete-template-description" style={{ margin: "6px 0 14px", color: "var(--fg-muted)", fontSize: 12, lineHeight: 1.5 }}>
          Delete &ldquo;{deleteTargetTemplate.name}&rdquo;? This cannot be undone.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" autoFocus onClick={closeDeleteConfirmation} style={renameSecondaryButton}>Cancel</button>
          <button type="button" onClick={() => void confirmDelete()} style={deleteTemplateButton}>Delete</button>
        </div>
      </section>
    </div>,
    globalThis.document.body,
  );
}
