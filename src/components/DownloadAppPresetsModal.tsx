import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { appPresetCounts, installAppPresets, type AppPresetInstallResult, type AppPresetSelection } from "../lib/appPresetInstaller";

interface DownloadAppPresetsModalProps {
  onClose: () => void;
}

const presetGroups: Array<{ id: keyof AppPresetSelection; label: string; description: string }> = [
  { id: "songs", label: "Songs", description: "Your saved song lyrics and slide labels." },
  { id: "overlays", label: "Overlays", description: "Speaker and service overlay designs." },
  { id: "templates", label: "Templates", description: "Scripture and song layouts, without media bindings." },
];

export function DownloadAppPresetsModal({ onClose }: DownloadAppPresetsModalProps) {
  const [selection, setSelection] = useState<AppPresetSelection>({ songs: true, overlays: true, templates: true });
  const [isInstalling, setIsInstalling] = useState(false);
  const [result, setResult] = useState<AppPresetInstallResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const handleInstall = async () => {
    setIsInstalling(true);
    setError(null);
    setResult(null);
    try {
      setResult(await installAppPresets(selection));
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : "Could not install the selected presets.");
    } finally {
      setIsInstalling(false);
    }
  };

  const selectedCount = (Object.keys(selection) as Array<keyof AppPresetSelection>)
    .reduce((total, key) => total + (selection[key] ? appPresetCounts[key] : 0), 0);

  return createPortal(
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isInstalling) onClose();
      }}
      style={{ position: "fixed", inset: 0, zIndex: 1500, display: "grid", placeItems: "center", padding: 20, background: "var(--overlay-backdrop)" }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-presets-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !isInstalling) onClose();
        }}
        style={{ width: "min(520px, 96vw)", maxHeight: "88vh", overflow: "auto", padding: 20, border: "1px solid var(--border-base)", borderRadius: 8, background: "var(--bg-surface)", color: "var(--fg-base)", boxShadow: "var(--shadow-lg)", outline: "none" }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h2 id="app-presets-title" style={{ margin: 0, fontSize: 17 }}>Download App Presets</h2>
            <p style={{ margin: "6px 0 0", color: "var(--fg-muted)", fontSize: 11, lineHeight: 1.5 }}>
              Add the selected presets to this app’s local library. Existing items are kept.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={isInstalling} aria-label="Close preset downloads" title="Close" style={{ width: 28, height: 28, flexShrink: 0, border: 0, borderRadius: 4, background: "var(--bg-elevated)", color: "var(--fg-base)", cursor: isInstalling ? "default" : "pointer", fontSize: 18 }}>
            ×
          </button>
        </div>

        <div style={{ marginTop: 18, borderTop: "1px solid var(--border-base)" }}>
          {presetGroups.map((group) => (
            <label key={group.id} style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr) auto", alignItems: "center", gap: 11, padding: "13px 2px", borderBottom: "1px solid var(--border-base)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={selection[group.id]}
                disabled={isInstalling}
                onChange={(event) => setSelection((current) => ({ ...current, [group.id]: event.target.checked }))}
                aria-label={`Include ${group.label}`}
                style={{ width: 15, height: 15, margin: 0, accentColor: "var(--color-primary)" }}
              />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 12, fontWeight: 650 }}>{group.label}</span>
                <span style={{ display: "block", marginTop: 3, color: "var(--fg-muted)", fontSize: 10, lineHeight: 1.4 }}>{group.description}</span>
              </span>
              <span style={{ color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", fontSize: 10, whiteSpace: "nowrap" }}>
                {appPresetCounts[group.id]} items
              </span>
            </label>
          ))}
        </div>

        {result ? (
          <p role="status" aria-live="polite" style={{ margin: "14px 0 0", color: "var(--color-success)", fontSize: 11 }}>
            Added {result.songs.added} songs, {result.overlays.added} overlays, and {result.templates.added} templates. Existing presets were left unchanged.
          </p>
        ) : null}
        {error ? <p role="alert" style={{ margin: "14px 0 0", color: "var(--color-error)", fontSize: 11 }}>{error} Any presets already installed can be skipped safely on retry.</p> : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button type="button" onClick={onClose} disabled={isInstalling} style={{ minHeight: 32, padding: "0 12px", border: "1px solid var(--border-base)", borderRadius: 4, background: "transparent", color: "var(--fg-base)", fontSize: 11, cursor: "pointer" }}>
            Close
          </button>
          <button type="button" onClick={() => void handleInstall()} disabled={isInstalling || selectedCount === 0} style={{ minHeight: 32, minWidth: 96, padding: "0 14px", border: 0, borderRadius: 4, background: "var(--color-primary)", color: "var(--fg-on-accent)", fontSize: 11, fontWeight: 650, cursor: isInstalling || selectedCount === 0 ? "default" : "pointer", opacity: isInstalling || selectedCount === 0 ? 0.6 : 1 }}>
            {isInstalling ? "Installing…" : "Download"}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}