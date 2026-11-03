import { useEffect, useState } from "react";

import { seekTestFeed, startTestFeed, stopTestFeed } from "../lib/sidecarClient";
import { formatFeedPosition, isTestFeedActive, useTestFeedStore } from "../stores/testFeedStore";
import type { SidecarTestFeedEvent, TestFeedDetectedMarker, TestFeedSourceInfo } from "../types/state";
import { TestFeedSeekBar } from "./TestFeedSeekBar";

/**
 * Dev-only live-feed test harness controls for the ingestion timeline (SS-072).
 *
 * While a feed is active a loud badge says so, so nobody mistakes recorded
 * audio for the live microphone. The source input only appears when the
 * sidecar runs with SERMONSYNC_DEV_FEED=1.
 *
 * Pressing Enter in the source field loads the source (duration, captions,
 * reference markers) so the seek bar can pick a start point before FEED;
 * while a feed plays, the bar seeks it.
 */
export function TestFeedBar() {
  const enabled = useTestFeedStore((s) => s.enabled);
  const status = useTestFeedStore((s) => s.status);
  const sourceInfo = useTestFeedStore((s) => s.sourceInfo);
  const sourceLoading = useTestFeedStore((s) => s.sourceLoading);
  const sourceError = useTestFeedStore((s) => s.sourceError);
  const loadSource = useTestFeedStore((s) => s.loadSource);
  const duration = useTestFeedStore((s) => s.duration);
  const markers = useTestFeedStore((s) => s.markers);
  return (
    <TestFeedBarView
      enabled={enabled}
      status={status}
      sourceInfo={sourceInfo}
      sourceLoading={sourceLoading !== null}
      sourceError={sourceError}
      onLoadSource={loadSource}
      feedDuration={duration}
      detectedMarkers={markers}
    />
  );
}

interface TestFeedBarViewProps {
  /** The sidecar runs with SERMONSYNC_DEV_FEED=1. */
  enabled: boolean;
  status: SidecarTestFeedEvent | null;
  /** The loaded source, keyed by the source string the user typed. */
  sourceInfo?: TestFeedSourceInfo | null;
  sourceLoading?: boolean;
  sourceError?: string | null;
  onLoadSource?: (source: string) => void;
  /** Source length from the feed's status, for a source not loaded with Enter. */
  feedDuration?: number | null;
  /** References the matcher suggested during the current or last run. */
  detectedMarkers?: TestFeedDetectedMarker[];
}

export function TestFeedBarView({
  enabled,
  status,
  sourceInfo = null,
  sourceLoading = false,
  sourceError = null,
  onLoadSource,
  feedDuration = null,
  detectedMarkers = [],
}: TestFeedBarViewProps) {
  const [source, setSource] = useState("");
  const [monitor, setMonitor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Start point picked on the seek bar before pressing FEED, per source.
  const [pending, setPending] = useState<{ key: string; t: number } | null>(null);
  const active = isTestFeedActive(status);
  const playing = status?.state === "playing";

  // A feed started elsewhere (scripts/run_feed.py): load its seek bar too.
  const runningSource = active ? status?.source : null;
  useEffect(() => {
    if (runningSource) onLoadSource?.(runningSource);
  }, [runningSource, onLoadSource]);

  if (!enabled && !active) {
    return null;
  }

  const shownSource = active ? status?.source ?? null : source.trim();
  const info = sourceInfo && sourceInfo.source === shownSource ? sourceInfo : null;
  const pendingStart = pending && pending.key === shownSource ? pending.t : 0;
  // The run's own status knows the length even when the source was never
  // loaded with Enter; detected markers belong to the run's source only.
  const runShown = status !== null && status.source === shownSource;
  const barDuration = info?.duration ?? (runShown ? feedDuration : null);
  const detected = runShown ? detectedMarkers : [];

  const jump = async (seconds: number) => {
    if (!active) {
      setPending({ key: source.trim(), t: seconds });
      return;
    }
    setError(null);
    try {
      await seekTestFeed(seconds);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const submit = async () => {
    setError(null);
    try {
      if (active) {
        await stopTestFeed();
        return;
      }
      const trimmed = source.trim();
      if (!trimmed) return;
      await startTestFeed({
        source: trimmed,
        start: info ? pendingStart : 0,
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
      {!active && info ? (
        <div
          title={info.title}
          style={{
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            color: "var(--fg-subtle)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {`${info.title} · ${info.duration ? formatFeedPosition(info.duration) : "length unknown"} · ${info.markers.length} refs in captions`}
        </div>
      ) : null}
      {sourceLoading ? (
        <div style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--fg-subtle)" }}>
          Loading source (first time downloads it)…
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
            onKeyDown={(event) => {
              // Enter loads the source for the seek bar; FEED starts it.
              if (event.key === "Enter") {
                event.preventDefault();
                onLoadSource?.(source.trim());
              }
            }}
            onBlur={() => onLoadSource?.(source.trim())}
            disabled={active}
            placeholder="DEV feed: URL or path"
            aria-label="Test feed source"
            title="Enter loads the seek bar; ▶ FEED starts playing"
            style={{ ...fieldStyle, flex: 1, minWidth: 0 }}
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
      {/* SS-075: under the source field, directly above the transcript list. */}
      {barDuration ? (
        <TestFeedSeekBar
          duration={barDuration}
          position={active ? status?.position ?? 0 : pendingStart}
          playing={active}
          disabled={active && !playing}
          cues={info?.cues ?? []}
          markers={info?.markers ?? []}
          detected={detected}
          onJump={(seconds) => void jump(seconds)}
        />
      ) : null}
      {error || sourceError || status?.error ? (
        <div style={{ fontSize: "11px", color: "var(--color-error)", fontFamily: "var(--font-mono)" }}>
          {error ?? sourceError ?? status?.error}
        </div>
      ) : null}
    </div>
  );
}
