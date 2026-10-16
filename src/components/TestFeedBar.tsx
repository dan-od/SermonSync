import { useState } from "react";

import { startTestFeed, stopTestFeed } from "../lib/sidecarClient";
import { formatFeedPosition, isTestFeedActive, useTestFeedStore } from "../stores/testFeedStore";
import type { SidecarTestFeedEvent } from "../types/state";

/**
 * Dev-only live-feed test harness controls for the ingestion timeline (SS-072).
 *
 * While a feed is active a loud badge says so, so nobody mistakes recorded
 * audio for the live microphone. The source input only appears when the
 * sidecar runs with SERMONSYNC_DEV_FEED=1.
 */
export function TestFeedBar() {
  const enabled = useTestFeedStore((s) => s.enabled);
  const status = useTestFeedStore((s) => s.status);
  return <TestFeedBarView enabled={enabled} status={status} />;
}

interface TestFeedBarViewProps {
  /** The sidecar runs with SERMONSYNC_DEV_FEED=1. */
  enabled: boolean;
  status: SidecarTestFeedEvent | null;
}

export function TestFeedBarView({ enabled, status }: TestFeedBarViewProps) {
  const [source, setSource] = useState("");
  const [start, setStart] = useState("");
  const [monitor, setMonitor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = isTestFeedActive(status);

  if (!enabled && !active) {
    return null;
  }

  const submit = async () => {
    setError(null);
    try {
      if (active) {
        await stopTestFeed();
        return;
      }
      const trimmed = source.trim();
      if (!trimmed) return;
      const startSeconds = Number.parseFloat(start);
      await startTestFeed({
        source: trimmed,
        start: Number.isFinite(startSeconds) && startSeconds > 0 ? startSeconds : 0,
        monitor,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const stateLabel =
    status?.state === "loading" ? " · LOADING" : status?.state === "draining" ? " · FINISHING" : "";
  const fieldStyle = {
    background: "var(--bg-elevated)",
    color: "var(--fg-base)",
    border: "none",
    outline: "none",
    borderRadius: "var(--radius-md)",
    padding: "6px 8px",
    fontSize: "11px",
    fontFamily: "var(--font-mono)",
  } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      {active && status ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="test-feed-badge"
          title={status.source ?? undefined}
          style={{
            display: "flex",
            gap: "6px",
            alignItems: "baseline",
            background: "var(--color-warning)",
            color: "#1a1200",
            borderRadius: "var(--radius-md)",
            padding: "5px 8px",
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
          }}
        >
          {/* The position stays visible however narrow the column: only the title truncates. */}
          <span style={{ flexShrink: 0 }}>TEST FEED:</span>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
            {status.title ?? status.source ?? "…"}
          </span>
          <span style={{ flexShrink: 0 }}>
            {`· ${formatFeedPosition(status.position)}${stateLabel}${status.speed !== 1 ? ` · ${status.speed}×` : ""}`}
          </span>
        </div>
      ) : null}
      {enabled ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}
        >
          <input
            value={source}
            onChange={(event) => setSource(event.target.value)}
            disabled={active}
            placeholder="DEV feed: URL or path"
            aria-label="Test feed source"
            style={{ ...fieldStyle, flex: 1, minWidth: 0 }}
          />
          <input
            value={start}
            onChange={(event) => setStart(event.target.value)}
            disabled={active}
            inputMode="decimal"
            placeholder="start s"
            aria-label="Test feed start (seconds)"
            style={{ ...fieldStyle, width: "56px" }}
          />
          <label
            title="Play the audio out loud"
            style={{ display: "flex", alignItems: "center", gap: "3px", fontSize: "11px", color: "var(--fg-subtle)" }}
          >
            <input
              type="checkbox"
              checked={monitor}
              disabled={active}
              onChange={(event) => setMonitor(event.target.checked)}
            />
            🔊
          </label>
          <button
            type="submit"
            aria-label={active ? "Stop test feed" : "Start test feed"}
            style={{
              ...fieldStyle,
              background: active ? "var(--color-error)" : "var(--color-primary)",
              color: "white",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            {active ? "■ STOP" : "▶ FEED"}
          </button>
        </form>
      ) : null}
      {error || status?.error ? (
        <div style={{ fontSize: "11px", color: "var(--color-error)", fontFamily: "var(--font-mono)" }}>
          {error ?? status?.error}
        </div>
      ) : null}
    </div>
  );
}
