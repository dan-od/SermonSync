import { useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

import {
  SEEK_LEAD_SECONDS,
  clampTime,
  cueAt,
  detectedMarkerLabel,
  leadIn,
  parseClock,
  seekStepForKey,
  timeAtOffset,
} from "../lib/testFeedSeek";
import { formatFeedPosition } from "../stores/testFeedStore";
import type { TestFeedCue, TestFeedDetectedMarker, TestFeedMarker } from "../types/state";

interface TestFeedSeekBarProps {
  /** Length of the whole source, seconds. */
  duration: number;
  /** Where playback is (a running feed), or the start picked before pressing FEED. */
  position: number;
  /** True while a feed is playing (jumps seek it); false picks the start point. */
  playing: boolean;
  disabled?: boolean;
  cues: TestFeedCue[];
  /** References spoken in the source's captions. */
  markers: TestFeedMarker[];
  /** References the matcher suggested during this run (SS-075). */
  detected?: TestFeedDetectedMarker[];
  /** Jump to `seconds` (already moved SEEK_LEAD_SECONDS early where that applies). */
  onJump: (seconds: number) => void;
}

type MarkerHit = { kind: "caption" | "detected"; index: number };

const TOOLTIP_MAX_WIDTH = 240;
/** A marker within this many px of the pointer is the one hovered/clicked. */
const MARKER_HIT_PX = 4;
/** A press that moves less than this is a click, not a drag. */
const DRAG_THRESHOLD_PX = 3;

/**
 * Dev-only seek bar for the test feed (SS-072): the full length of the
 * sermon, reference markers from its captions, references the matcher
 * detected during the run (SS-075), and a tooltip with the caption line at any
 * point. Clicking or dragging picks a point; every pick lands
 * SEEK_LEAD_SECONDS early. Clicking a marker jumps to that marker.
 */
export function TestFeedSeekBar({
  duration,
  position,
  playing,
  disabled = false,
  cues,
  markers,
  detected = [],
  onJump,
}: TestFeedSeekBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const pressX = useRef<number | null>(null);
  const [hover, setHover] = useState<{ x: number; width: number; marker: MarkerHit | null } | null>(
    null,
  );
  // Where the thumb is being dragged to; the seek happens on release.
  const [dragTime, setDragTime] = useState<number | null>(null);
  const [timeText, setTimeText] = useState("");
  const [timeInvalid, setTimeInvalid] = useState(false);

  const pct = (t: number) => `${Math.min(100, Math.max(0, (t / duration) * 100))}%`;
  const jump = (t: number) => {
    if (!disabled) onJump(t);
  };
  const shown = dragTime ?? position;

  // Markers can sit a pixel apart in the narrow column: the one nearest the
  // pointer is hovered and clicked, so the tooltip always names the target.
  const locate = (event: PointerEvent<HTMLElement>) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = event.clientX - rect.left;
    let marker: MarkerHit | null = null;
    let best = MARKER_HIT_PX;
    const consider = (kind: MarkerHit["kind"], time: number, index: number) => {
      const distance = Math.abs((time / duration) * rect.width - x);
      if (distance <= best) {
        best = distance;
        marker = { kind, index };
      }
    };
    markers.forEach((m, index) => consider("caption", m.time, index));
    detected.forEach((m, index) => consider("detected", m.time, index));
    return { x, width: rect.width, marker };
  };

  const markerTime = (hit: MarkerHit | null) =>
    hit === null
      ? null
      : hit.kind === "caption"
        ? markers[hit.index]?.time ?? null
        : detected[hit.index]?.time ?? null;

  const endPress = () => {
    pressX.current = null;
    setDragTime(null);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    pressX.current = event.clientX;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const at = locate(event);
    setHover(at);
    if (pressX.current === null || !at) return;
    if (dragTime !== null || Math.abs(event.clientX - pressX.current) >= DRAG_THRESHOLD_PX) {
      setDragTime(timeAtOffset(at.x, at.width, duration));
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (pressX.current === null) return;
    const at = locate(event);
    const dragged = dragTime !== null;
    endPress();
    if (!at) return;
    const snapped = dragged ? null : markerTime(at.marker);
    jump(leadIn(snapped ?? timeAtOffset(at.x, at.width, duration), duration));
  };

  const onBarKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = seekStepForKey(event);
    if (step === null) return;
    event.preventDefault();
    // The timeline panel also seeks on arrows; handle this press only once.
    event.stopPropagation();
    jump(clampTime(position + step, duration));
  };

  const submitTime = () => {
    const t = parseClock(timeText);
    if (t === null || t > duration) {
      setTimeInvalid(true);
      return;
    }
    setTimeInvalid(false);
    setTimeText("");
    jump(leadIn(t, duration));
  };

  let tooltip: { title: string; text: string | null } | null = null;
  if (hover) {
    const hit = dragTime === null ? hover.marker : null;
    const caption = hit?.kind === "caption" ? markers[hit.index] : null;
    const found = hit?.kind === "detected" ? detected[hit.index] : null;
    if (caption) {
      tooltip = {
        title: `${caption.reference} · ${formatFeedPosition(caption.time)}`,
        text: caption.caption_text,
      };
    } else if (found) {
      tooltip = {
        title: detectedMarkerLabel(found),
        text: `detected at ${formatFeedPosition(found.time)}`,
      };
    } else {
      const t = dragTime ?? timeAtOffset(hover.x, hover.width, duration);
      tooltip = { title: formatFeedPosition(t), text: cueAt(cues, t)?.text ?? null };
    }
  }
  const tooltipWidth = hover ? Math.min(TOOLTIP_MAX_WIDTH, hover.width) : 0;
  const tooltipLeft = hover
    ? Math.min(Math.max(0, hover.x - tooltipWidth / 2), hover.width - tooltipWidth)
    : 0;

  const buttonStyle = {
    background: "var(--bg-elevated)",
    color: "var(--fg-base)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    padding: "3px 6px",
    fontSize: "10px",
    fontFamily: "var(--font-mono)",
    cursor: disabled ? "default" : "pointer",
    flexShrink: 0,
  } as const;

  const hovered = (kind: MarkerHit["kind"], index: number) =>
    hover?.marker?.kind === kind && hover.marker.index === index;

  return (
    <div
      data-testid="test-feed-seek"
      style={{ display: "flex", flexDirection: "column", gap: "4px", opacity: disabled ? 0.6 : 1 }}
    >
      <div
        ref={barRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={playing ? "Seek test feed" : "Pick test feed start"}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={formatFeedPosition(shown)}
        aria-disabled={disabled || undefined}
        title="Click or drag to seek (lands 10 s early) · ←/→ 5 s · Shift 30 s"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={endPress}
        onPointerLeave={() => {
          if (pressX.current === null) setHover(null);
        }}
        onKeyDown={onBarKey}
        style={{
          position: "relative",
          height: "16px",
          cursor: disabled ? "default" : dragTime !== null ? "grabbing" : "pointer",
          outline: "none",
          touchAction: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "6px",
            height: "4px",
            borderRadius: "var(--radius-full)",
            background: "var(--bg-elevated)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: playing || dragTime !== null ? pct(shown) : "0%",
              height: "100%",
              background: "var(--color-warning)",
            }}
          />
        </div>
        {markers.map((marker, index) => (
          <div
            key={`caption-${marker.time}-${marker.reference}`}
            role="img"
            aria-label={`${marker.reference} at ${formatFeedPosition(marker.time)}`}
            style={{
              position: "absolute",
              left: pct(marker.time),
              top: 0,
              width: "2px",
              height: "16px",
              marginLeft: "-1px",
              borderRadius: "1px",
              pointerEvents: "none",
              background: hovered("caption", index) ? "var(--fg-base)" : "var(--color-primary)",
              zIndex: hovered("caption", index) ? 1 : undefined,
            }}
          />
        ))}
        {detected.map((marker, index) => (
          <div
            key={`detected-${index}-${marker.time}-${marker.reference}`}
            role="img"
            aria-label={`Detected ${detectedMarkerLabel(marker)} at ${formatFeedPosition(marker.time)}`}
            style={{
              position: "absolute",
              left: pct(marker.time),
              top: "5px",
              width: "6px",
              height: "6px",
              marginLeft: "-3px",
              borderRadius: "var(--radius-full)",
              boxSizing: "border-box",
              border: "1px solid var(--bg-surface)",
              pointerEvents: "none",
              background: hovered("detected", index) ? "var(--fg-base)" : "var(--color-success)",
              zIndex: hovered("detected", index) ? 2 : 1,
            }}
          />
        ))}
        <div
          aria-hidden
          data-testid="test-feed-seek-thumb"
          style={{
            position: "absolute",
            left: pct(shown),
            top: "3px",
            width: "10px",
            height: "10px",
            marginLeft: "-5px",
            borderRadius: "var(--radius-full)",
            boxSizing: "border-box",
            border: "2px solid var(--bg-surface)",
            background: playing || dragTime !== null ? "var(--color-warning)" : "var(--fg-base)",
            boxShadow: "var(--shadow-sm)",
            pointerEvents: "none",
            zIndex: 3,
          }}
        />
        {tooltip ? (
          <div
            role="tooltip"
            style={{
              position: "absolute",
              bottom: "calc(100% + 4px)",
              left: `${tooltipLeft}px`,
              width: `${tooltipWidth}px`,
              boxSizing: "border-box",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-base)",
              boxShadow: "var(--shadow-md)",
              borderRadius: "var(--radius-md)",
              padding: "4px 6px",
              fontSize: "11px",
              lineHeight: 1.35,
              color: "var(--fg-base)",
              pointerEvents: "none",
              zIndex: 10,
            }}
          >
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{tooltip.title}</div>
            {tooltip.text ? <div style={{ color: "var(--fg-muted)" }}>{tooltip.text}</div> : null}
          </div>
        ) : null}
      </div>
      {/* Wraps in the narrow timeline column: the clock drops below the buttons. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 4px", alignItems: "center" }}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => jump(clampTime(position - 10, duration))}
          aria-label="Back 10 seconds"
          style={buttonStyle}
        >
          −10 s
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => jump(clampTime(position + 10, duration))}
          aria-label="Forward 10 seconds"
          style={buttonStyle}
        >
          +10 s
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => jump(clampTime(position + 30, duration))}
          aria-label="Forward 30 seconds"
          style={buttonStyle}
        >
          +30 s
        </button>
        <input
          value={timeText}
          disabled={disabled}
          onChange={(event) => {
            setTimeText(event.target.value);
            setTimeInvalid(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submitTime();
            }
          }}
          placeholder="42:15"
          aria-label={`Jump to time (lands ${SEEK_LEAD_SECONDS} s early)`}
          title={`Type a time and press Enter; lands ${SEEK_LEAD_SECONDS} s early`}
          aria-invalid={timeInvalid || undefined}
          style={{
            ...buttonStyle,
            cursor: "text",
            width: "52px",
            outline: timeInvalid ? "1px solid var(--color-error)" : "none",
          }}
        />
        <span
          style={{
            marginLeft: "auto",
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            color: "var(--fg-subtle)",
            whiteSpace: "nowrap",
          }}
        >
          {`${playing ? "" : "start "}${formatFeedPosition(shown)} / ${formatFeedPosition(duration)}`}
        </span>
      </div>
    </div>
  );
}
