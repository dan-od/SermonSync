import { useState } from "react";

import { isTauriRuntime } from "../libraryUtils";

export function AddScriptureModal({
  onClose,
  onImportBible,
  isImporting,
  importError,
}: {
  onClose: () => void;
  onImportBible: () => Promise<void>;
  isImporting: boolean;
  importError: string | null;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add scripture source"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--overlay-backdrop-strong)",
        }}
      />

      {/* Modal card */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-base)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-6) var(--space-6) var(--space-4)",
          minWidth: 280,
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-xs)",
            letterSpacing: "0.08em",
            color: "var(--fg-muted)",
            marginBottom: "var(--space-4)",
          }}
        >
          ADD BIBLE SOURCE
        </div>

        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          <ModalChoiceButton
            icon="📖"
            label={isImporting ? "Importing..." : "Import Local Bible"}
            description={isTauriRuntime() ? "Choose a Zefania or OSIS XML file" : "Open in Tauri to import local files"}
            onClick={() => void onImportBible()}
            disabled={isImporting || !isTauriRuntime()}
          />
          <ModalChoiceButton
            icon="🌐"
            label="Connect API Bible"
            description="API Bible connections are not available yet"
            onClick={() => undefined}
            disabled
          />
        </div>

        {importError && (
          <div
            style={{
              marginTop: "var(--space-3)",
              padding: "8px 10px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-error-border)",
              background: "var(--color-error-muted)",
              color: "var(--fg-base)",
              fontSize: "var(--text-xs)",
              lineHeight: 1.45,
            }}
          >
            {importError}
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          style={{
            display: "block",
            marginTop: "var(--space-4)",
            marginLeft: "auto",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontSize: "var(--text-xs)",
            color: "var(--fg-subtle)",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ModalChoiceButton({
  icon,
  label,
  description,
  onClick,
  disabled,
}: {
  icon: string;
  label: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => {
        if (!disabled) {
          setHovered(true);
        }
      }}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "var(--space-2)",
        padding: "var(--space-4)",
        background: disabled ? "var(--bg-surface)" : hovered ? "var(--color-primary-muted)" : "var(--bg-surface)",
        border: disabled ? "1px solid var(--border-base)" : hovered ? "1px solid var(--color-primary)" : "1px solid var(--border-base)",
        borderRadius: "var(--radius-md)",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 120ms ease, border-color 120ms ease",
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <span style={{ fontSize: "1.5rem", lineHeight: 1 }}>{icon}</span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-xs)",
          fontWeight: 600,
          letterSpacing: "0.06em",
          color: disabled ? "var(--fg-subtle)" : hovered ? "var(--color-primary)" : "var(--fg-base)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: "var(--text-xs)",
          color: "var(--fg-subtle)",
          textAlign: "center",
        }}
      >
        {description}
      </span>
    </button>
  );
}
