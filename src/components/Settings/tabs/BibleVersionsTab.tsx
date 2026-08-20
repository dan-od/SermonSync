import { useEffect, useState, type CSSProperties } from "react";

import { getSidecarHttpBase } from "../../../lib/sidecarClient";
import { useConfigStore } from "../../../stores/configStore";
import type { BibleVersionSummary } from "../../../types/state";
import { IconBook, IconUpload } from "../icons";
import { InfoBanner, SectionIntro, SelectRow, SettingsCard, StatusPill } from "../primitives";
const DOWNLOADABLE_VERSIONS: BibleVersionSummary[] = [
  { abbreviation: "NIV", name: "New International Version", verse_count: 31103, available: false },
  { abbreviation: "NKJV", name: "New King James Version", verse_count: 31102, available: false },
  { abbreviation: "ESV", name: "English Standard Version", verse_count: 31086, available: false },
  { abbreviation: "AMP", name: "Amplified Bible", verse_count: 31103, available: false },
  { abbreviation: "NLT", name: "New Living Translation", verse_count: 31103, available: false },
  { abbreviation: "MSG", name: "The Message", verse_count: 31103, available: false },
];

async function fetchVersions() {
  const response = await fetch(`${getSidecarHttpBase()}/api/bible/versions`);
  if (!response.ok) throw new Error(`Bible API error (${response.status})`);
  return (await response.json() as { versions: BibleVersionSummary[] }).versions;
}

async function responseError(response: Response, fallback: string) {
  try {
    const body = await response.json() as { detail?: unknown };
    return typeof body.detail === "string" && body.detail ? body.detail : fallback;
  } catch {
    return fallback;
  }
}

export function BibleVersionsTab() {
  const bibleVersion = useConfigStore((s) => s.bibleVersion);
  const configuredVersions = useConfigStore((s) => s.bibleVersions);
  const setBibleVersion = useConfigStore((s) => s.setBibleVersion);
  const setBibleVersions = useConfigStore((s) => s.setBibleVersions);
  const [versions, setVersions] = useState<BibleVersionSummary[]>(configuredVersions);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [busyVersion, setBusyVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<BibleVersionSummary | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<BibleVersionSummary | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      fetchVersions()
        .then((nextVersions) => {
          setVersions(nextVersions);
          setBibleVersions(nextVersions);
          if (!nextVersions.some((version) => version.abbreviation === bibleVersion && version.available)) {
            const fallback = nextVersions.find((version) => version.available);
            if (fallback) setBibleVersion(fallback.abbreviation);
          }
        })
        .catch((loadError: unknown) => {
          setError(loadError instanceof Error ? loadError.message : "Could not load Bible versions.");
        });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [bibleVersion, setBibleVersion, setBibleVersions]);

  const handleDownload = (abbreviation: string) => {
    setDownloading(abbreviation);
    window.setTimeout(() => {
      const downloaded = DOWNLOADABLE_VERSIONS.find((version) => version.abbreviation === abbreviation);
      if (downloaded) {
        const nextVersions = [...versions, { ...downloaded, available: true }];
        setVersions(nextVersions);
        setBibleVersions(nextVersions);
      }
      setDownloading(null);
    }, 1200);
  };

  const openRename = (version: BibleVersionSummary) => {
    setRenameTarget(version);
    setRenameValue(version.name);
    setError(null);
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    const version = renameTarget;
    const name = renameValue.trim();
    if (!name || name === version.name) {
      setRenameTarget(null);
      return;
    }
    setBusyVersion(version.abbreviation);
    setError(null);
    try {
      const response = await fetch(`${getSidecarHttpBase()}/api/bible/versions/${encodeURIComponent(version.abbreviation)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error(await responseError(response, `Could not rename ${version.abbreviation}.`));
      const nextVersions = versions.map((entry) => entry.abbreviation === version.abbreviation ? { ...entry, name } : entry);
      setVersions(nextVersions);
      setBibleVersions(nextVersions);
      setRenameTarget(null);
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "Could not rename Bible version.");
    } finally {
      setBusyVersion(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const version = deleteTarget;
    setBusyVersion(version.abbreviation);
    setError(null);
    try {
      const response = await fetch(`${getSidecarHttpBase()}/api/bible/versions/${encodeURIComponent(version.abbreviation)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response, `Could not delete ${version.abbreviation}.`));
      const nextVersions = versions.filter((entry) => entry.abbreviation !== version.abbreviation);
      setVersions(nextVersions);
      setBibleVersions(nextVersions);
      if (bibleVersion === version.abbreviation) {
        const fallback = nextVersions.find((entry) => entry.available);
        if (fallback) setBibleVersion(fallback.abbreviation);
      }
      setDeleteTarget(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete Bible version.");
    } finally {
      setBusyVersion(null);
    }
  };

  const availableVersions = versions.filter((version) => version.available);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <SectionIntro title="Bible Version Management" description="Rename, delete, import, and choose the default Bible version used by the local library." />
      {error ? <InfoBanner tone="warning">{error}</InfoBanner> : null}
      <SettingsCard icon={<IconBook />} title="Default Display Version">
        <SelectRow label="Default Bible Version" value={bibleVersion} options={availableVersions.map((version) => ({ value: version.abbreviation, label: `${version.abbreviation} — ${version.name}` }))} onChange={setBibleVersion} hint="The selected version is used by the local scripture library." />
      </SettingsCard>
      <SettingsCard icon={<IconBook />} title="Downloaded and Imported Versions" subtitle="Manage the Bible text currently stored in the app">
        <VersionList versions={availableVersions} busyVersion={busyVersion} onRename={openRename} onDelete={setDeleteTarget} />
      </SettingsCard>
      <SettingsCard icon={<IconBook />} title="Download Additional Versions" subtitle="Via getBible.net API — 100+ versions, 50+ languages">
        <VersionList versions={DOWNLOADABLE_VERSIONS.filter((version) => !versions.some((existing) => existing.abbreviation === version.abbreviation))} onDownload={handleDownload} downloadingId={downloading} />
        <InfoBanner tone="warning">Copyrighted versions (NIV, NKJV, ESV, AMP, NLT, MSG) cannot be bundled in the installer — download or import only.</InfoBanner>
      </SettingsCard>
      <SettingsCard icon={<IconUpload />} title="Import Custom Version">
        <InfoBanner>Use the Local Library import action to add an OSIS XML version. It will appear here with rename and delete controls.</InfoBanner>
      </SettingsCard>
      {renameTarget ? (
        <VersionNameModal
          abbreviation={renameTarget.abbreviation}
          value={renameValue}
          busy={busyVersion === renameTarget.abbreviation}
          onChange={setRenameValue}
          onCancel={() => setRenameTarget(null)}
          onConfirm={() => void handleRename()}
        />
      ) : null}
      {deleteTarget ? (
        <DeleteVersionModal
          version={deleteTarget}
          busy={busyVersion === deleteTarget.abbreviation}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void handleDelete()}
        />
      ) : null}
    </div>
  );
}

function VersionList({ versions, onDownload, downloadingId, busyVersion, onRename, onDelete }: {
  versions: BibleVersionSummary[];
  onDownload?: (abbreviation: string) => void;
  downloadingId?: string | null;
  busyVersion?: string | null;
  onRename?: (version: BibleVersionSummary) => void;
  onDelete?: (version: BibleVersionSummary) => void;
}) {
  if (versions.length === 0) return <p style={{ fontSize: "10px", color: "var(--fg-subtle)" }}>No Bible versions available.</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {versions.map((version) => {
        const busy = busyVersion === version.abbreviation;
        return (
          <div key={version.abbreviation} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "8px 12px", background: "var(--bg-base)", borderRadius: "var(--radius-md)" }}>
            <div style={{ minWidth: 0 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--fg-base)" }}>{version.abbreviation}</span>
              <span style={{ fontSize: "10px", color: "var(--fg-subtle)", marginLeft: "8px" }}>{version.name}</span>
              <span style={{ display: "block", fontSize: "10px", color: "var(--fg-subtle)", marginTop: "3px" }}>{version.verse_count.toLocaleString()} verses</span>
            </div>
            {onDownload ? (
              <button type="button" disabled={downloadingId === version.abbreviation} onClick={() => onDownload(version.abbreviation)} style={actionButtonStyle}>{downloadingId === version.abbreviation ? "Downloading..." : "Download"}</button>
            ) : (
              <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                <StatusPill tone="success" label="Installed" />
                <button type="button" disabled={busy} onClick={() => onRename?.(version)} style={actionButtonStyle}>Rename</button>
                <button type="button" disabled={busy} onClick={() => onDelete?.(version)} style={{ ...actionButtonStyle, color: "var(--color-error)" }}>Delete</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function VersionNameModal({ abbreviation, value, busy, onChange, onCancel, onConfirm }: {
  abbreviation: string;
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalShell title={`Rename ${abbreviation}`} onClose={onCancel}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim()) onConfirm();
        }}
        style={{ display: "grid", gap: "16px" }}
      >
        <label style={{ display: "grid", gap: "7px", color: "var(--fg-muted)", fontSize: "11px" }}>
          Version name
          <input
            autoFocus
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-label="Bible version name"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "10px 11px",
              border: "1px solid var(--color-primary)",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-base)",
              color: "var(--fg-base)",
              fontFamily: "var(--font-sans)",
              fontSize: "13px",
              outline: "none",
            }}
          />
        </label>
        <ModalActions busy={busy} confirmLabel="Save name" onCancel={onCancel} />
      </form>
    </ModalShell>
  );
}

function DeleteVersionModal({ version, busy, onCancel, onConfirm }: {
  version: BibleVersionSummary;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalShell title={`Delete ${version.abbreviation}`} onClose={onCancel}>
      <div style={{ display: "grid", gap: "16px" }}>
        <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: "13px", lineHeight: 1.5 }}>
          Delete <strong style={{ color: "var(--fg-base)" }}>{version.name}</strong> and its {version.verse_count.toLocaleString()} stored verses? This cannot be undone.
        </p>
        <ModalActions busy={busy} confirmLabel="Delete version" destructive onCancel={onCancel} onConfirm={onConfirm} />
      </div>
    </ModalShell>
  );
}

function ModalActions({ busy, confirmLabel, destructive = false, onCancel, onConfirm }: {
  busy: boolean;
  confirmLabel: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm?: () => void;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
      <button type="button" onClick={onCancel} disabled={busy} style={secondaryButtonStyle}>Cancel</button>
      <button type={onConfirm ? "button" : "submit"} onClick={onConfirm} disabled={busy} style={{ ...primaryButtonStyle, ...(destructive ? { background: "var(--color-error)" } : {}) }}>
        {busy ? "Working..." : confirmLabel}
      </button>
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{ position: "fixed", inset: 0, zIndex: 1400, display: "grid", placeItems: "center", padding: "20px", background: "var(--overlay-backdrop)" }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="bible-version-modal-title" style={{ width: "min(420px, 100%)", background: "var(--bg-surface)", border: "1px solid var(--border-base)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)", overflow: "hidden" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "14px 16px", borderBottom: "1px solid var(--border-base)" }}>
          <h2 id="bible-version-modal-title" style={{ margin: 0, color: "var(--fg-base)", fontSize: "14px" }}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={closeButtonStyle}>×</button>
        </header>
        <div style={{ padding: "16px" }}>{children}</div>
      </div>
    </div>
  );
}

const actionButtonStyle: CSSProperties = {
  background: "var(--color-primary-muted)",
  border: "none",
  color: "var(--color-primary)",
  borderRadius: "var(--radius-md)",
  fontSize: "10px",
  fontWeight: 700,
  padding: "4px 10px",
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid var(--border-base)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-elevated)",
  color: "var(--fg-muted)",
  padding: "8px 12px",
  fontSize: "11px",
  fontWeight: 700,
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: "var(--radius-md)",
  background: "var(--color-primary)",
  color: "var(--fg-on-accent)",
  padding: "8px 12px",
  fontSize: "11px",
  fontWeight: 700,
  cursor: "pointer",
};

const closeButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "var(--fg-subtle)",
  fontSize: "20px",
  lineHeight: 1,
  cursor: "pointer",
};
