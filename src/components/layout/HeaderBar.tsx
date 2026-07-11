/**
 * Top header bar (SS-007 scaffold).
 *
 * Placeholder slots for the system indicators that SS-052 assembles. Dee owns
 * the real components — these are labelled mount points wired to the stores.
 */
import type { ReactNode } from "react";

import { useAudioStore } from "../../stores/audioStore";
import { useConfigStore } from "../../stores/configStore";
import { useSessionStore } from "../../stores/sessionStore";

function Slot({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="header-slot" data-slot={label}>
      <span className="header-slot__label">{label}</span>
      <span className="header-slot__value">{children ?? "—"}</span>
    </div>
  );
}

export function HeaderBar() {
  const audio = useAudioStore();
  const session = useSessionStore();
  const config = useConfigStore();

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-4)",
        padding: "0 var(--space-4)",
        height: "48px",
        background: "var(--bg-surface)",
        borderBottom: "1px solid var(--border-base)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-xs)",
      }}
    >
      <strong style={{ color: "var(--color-primary)", fontFamily: "var(--font-sans)" }}>
        SermonSync
      </strong>
      {/* TODO(Dee): live audio waveform visualizer */}
      <Slot label="WAVEFORM">▁▂▄▆▄▂▁</Slot>
      <Slot label="INPUT">{audio.inputDevice?.name}</Slot>
      <Slot label="VAD">{audio.vadSensitivity.toFixed(2)}</Slot>
      <Slot label="LATENCY">{audio.latencyMs} ms</Slot>
      <Slot label="STATUS">{session.status.toUpperCase()}</Slot>
      <div style={{ marginLeft: "auto" }}>
        <Slot label="UNIT">{config.unitId}</Slot>
      </div>
    </header>
  );
}
