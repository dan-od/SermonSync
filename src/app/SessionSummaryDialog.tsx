import { Suspense, lazy } from "react";

import type { SessionStatus, SuggestionCard, TranscriptItem } from "../types/state";
import { LazyPanelFallback } from "./LazyPanelFallback";

const SessionSummaryPanel = lazy(() =>
  import("../components/SessionSummaryPanel").then((module) => ({ default: module.SessionSummaryPanel })),
);

interface SessionSummaryDialogProps {
  isCloseHovered: boolean;
  onCloseHoveredChange: (hovered: boolean) => void;
  onClose: () => void;
  transcripts: TranscriptItem[];
  cards: SuggestionCard[];
  sessionStatus: SessionStatus;
  sessionElapsed: number;
  sessionId: string | null;
}

export function SessionSummaryDialog({
  isCloseHovered,
  onCloseHoveredChange,
  onClose,
  transcripts,
  cards,
  sessionStatus,
  sessionElapsed,
  sessionId,
}: SessionSummaryDialogProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Session summary"
      style={{ position: "fixed", inset: 0, zIndex: 1200, padding: "48px 6vw 6vh", background: "color-mix(in srgb, var(--bg-base) 72%, transparent)", backdropFilter: "blur(8px)" }}
    >
      <div style={{ height: "100%", overflow: "hidden", background: "var(--bg-base)", boxShadow: "var(--shadow-lg)" }}>
        <div style={{ height: "100%", position: "relative" }}>
          <button
            type="button"
            onClick={onClose}
            onMouseEnter={() => onCloseHoveredChange(true)}
            onMouseLeave={() => onCloseHoveredChange(false)}
            aria-label="Close session summary"
            title="Close summary"
            style={{ position: "absolute", top: 14, right: 16, zIndex: 2, border: "none", background: isCloseHovered ? "var(--color-primary)" : "var(--bg-elevated)", color: isCloseHovered ? "var(--fg-on-accent)" : "var(--fg-muted)", width: 28, height: 28, cursor: "pointer", fontSize: 18, lineHeight: 1, transition: "background-color 120ms ease, color 120ms ease" }}
          >
            ×
          </button>
          <Suspense fallback={<LazyPanelFallback />}>
            <SessionSummaryPanel
              key={sessionId ?? sessionStatus}
              items={transcripts}
              cards={cards}
              sessionStatus={sessionStatus}
              sessionElapsedSeconds={sessionElapsed}
              sessionId={sessionId}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
