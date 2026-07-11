/**
 * Bottom status bar (SS-007 scaffold).
 *
 * Placeholder slots for the branding/system info that SS-053 assembles.
 */
import type { ReactNode } from "react";

import { useAudioStore } from "../../stores/audioStore";

function Slot({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="status-slot" data-slot={label}>
      <span style={{ color: "var(--fg-subtle)" }}>{label}:</span>{" "}
      <span>{children ?? "—"}</span>
    </div>
  );
}

export function StatusBar() {
  const audio = useAudioStore();

  return (
    <footer
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-4)",
        padding: "0 var(--space-4)",
        height: "28px",
        background: "var(--bg-surface)",
        borderTop: "1px solid var(--border-base)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-xs)",
        color: "var(--fg-muted)",
      }}
    >
      {/* TODO(Dee): pull engine version from GET /api/status */}
      <Slot label="ENGINE">sermonsync-ai v0.1.0</Slot>
      <Slot label="SYNC">offline-first</Slot>
      <Slot label="ARCHIVE">00:00:00</Slot>
      <Slot label="AUDIO">{audio.status}</Slot>
      <div style={{ marginLeft: "auto", color: "var(--fg-subtle)" }}>
        Foursquare Gospel Church
      </div>
    </footer>
  );
}
