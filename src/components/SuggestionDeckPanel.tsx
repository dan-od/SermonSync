import { useEffect, useMemo, useRef, useState } from "react";

import type { SuggestionCard } from "../types/state";
import { ScrollArea } from "./ui/ScrollArea";

function referenceLabel(card: SuggestionCard) {
  return `${card.reference.book} ${card.reference.chapter}:${card.reference.verse}`;
}

function confidenceTone(confidence: number) {
  const percent = Math.round(confidence * 100);
  if (percent <= 39) {
    return "#b91c1c";
  }
  if (percent <= 79) {
    return "#a16207";
  }
  return "#166534";
}

interface SuggestionDeckPanelProps {
  cards: SuggestionCard[];
  previewReference: string | null;
  liveReference: string | null;
  onPreview: (card: SuggestionCard) => void;
  onSendLive: (card: SuggestionCard) => void;
  onClearAll: () => void;
}

export function SuggestionDeckPanel({
  cards,
  previewReference,
  liveReference,
  onPreview,
  onSendLive,
  onClearAll,
}: SuggestionDeckPanelProps) {
  const visibleCards = useMemo(() => cards.slice(0, 3), [cards]);
  const [exitingCards, setExitingCards] = useState<SuggestionCard[]>([]);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const previousCardsRef = useRef<SuggestionCard[]>(visibleCards);

  useEffect(() => {
    const previousCards = previousCardsRef.current;
    const removed = previousCards.filter((prev) => !visibleCards.some((card) => card.id === prev.id));

    if (removed.length > 0) {
      setExitingCards((current) => {
        const existingIds = new Set(current.map((entry) => entry.id));
        const next = removed.filter((entry) => !existingIds.has(entry.id));
        return [...current, ...next];
      });

      const removedIds = new Set(removed.map((entry) => entry.id));
      const timeout = window.setTimeout(() => {
        setExitingCards((current) => current.filter((entry) => !removedIds.has(entry.id)));
      }, 320);

      return () => window.clearTimeout(timeout);
    }

    previousCardsRef.current = visibleCards;
    return undefined;
  }, [visibleCards]);

  useEffect(() => {
    previousCardsRef.current = visibleCards;
  }, [visibleCards]);

  return (
    <div
      style={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        background: "var(--bg-surface)",
        border: "none",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-3)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <style>{`
        .ss-suggestion-enter {
          animation: ssSuggestionEnter 300ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .ss-suggestion-exit {
          animation: ssSuggestionExit 300ms cubic-bezier(0.4, 0, 1, 1) both;
        }

        @keyframes ssSuggestionEnter {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.985);
            filter: blur(1.5px);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }

        @keyframes ssSuggestionExit {
          from {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
            max-height: 320px;
            margin-bottom: 0.75rem;
          }
          to {
            opacity: 0;
            transform: translateY(-10px) scale(0.985);
            filter: blur(1.5px);
            max-height: 0;
            margin-bottom: 0;
          }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: "28px" }}>
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              letterSpacing: "0.08em",
              color: "var(--fg-base)",
              fontWeight: 700,
            }}
          >
            ✧ SUGGESTION DECK
          </div>
        </div>
        <button
          type="button"
          onClick={onClearAll}
          aria-label="Clear suggestion deck"
          title="Clear suggestion deck"
          style={{
            display: "grid",
            placeItems: "center",
            border: "none",
            background: "transparent",
            color: "var(--fg-muted)",
            padding: "4px",
            cursor: "pointer",
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 7h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M9 7V5.8c0-.9.7-1.6 1.6-1.6h2.8c.9 0 1.6.7 1.6 1.6V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M7.4 7l.7 11c.1 1 .9 1.8 1.9 1.8h4c1 0 1.8-.8 1.9-1.8l.7-11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 11v5M14 11v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div style={{ height: "1px", background: "var(--border-base)" }} />

      <ScrollArea
        style={{ flex: 1, minHeight: 0 }}
        contentStyle={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          paddingRight: "2px",
          paddingBottom: "2px",
        }}
      >
        {visibleCards.map((card) => {
          const label = referenceLabel(card);
          const confidencePercent = Math.round(card.confidence * 100);
          const confidenceColor = confidenceTone(card.confidence);
          const isPreview = previewReference === label;
          const isLive = liveReference === label;
          const isHovered = hoveredCardId === card.id;
          const previewRing = isPreview ? "inset 0 0 0 1px rgba(123, 47, 247, 0.2)" : "none";
          const hoverGlow = isHovered ? "0 0 0 1px rgba(255, 75, 96, 0.82), 0 0 8px rgba(255, 36, 74, 0.35)" : "none";

          return (
            <article
              key={card.id}
              onClick={() => onPreview(card)}
              onDoubleClick={() => onSendLive(card)}
              onMouseEnter={() => setHoveredCardId(card.id)}
              onMouseLeave={() => setHoveredCardId((current) => (current === card.id ? null : current))}
              style={{
                border: `1px solid ${isPreview ? "var(--color-primary)" : "var(--border-base)"}`,
                borderLeft: `6px solid ${isLive ? "#00ff9f" : "#ff003b"}`,
                background: "var(--bg-elevated)",
                borderRadius: "12px",
                padding: "10px 12px",
                boxShadow: hoverGlow !== "none" ? `${previewRing !== "none" ? `${previewRing}, ` : ""}${hoverGlow}` : previewRing,
                cursor: "pointer",
                transition: "box-shadow 140ms ease",
              }}
              className="ss-suggestion-enter"
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "6px" }}>
                <div style={{ color: "var(--fg-base)", fontWeight: 800, fontSize: "14px", lineHeight: 1.1, fontFamily: "Georgia, serif" }}>{label}</div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ color: "var(--fg-muted)", fontFamily: "var(--font-mono)", fontSize: "9px", whiteSpace: "nowrap" }}>
                    Confidence: <span style={{ color: confidenceColor, fontWeight: 700 }}>{confidencePercent}%</span>
                  </span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSendLive(card);
                    }}
                    onDoubleClick={(event) => event.stopPropagation()}
                    title="Send live"
                    aria-label={`Send ${label} live`}
                    style={{
                      width: "24px",
                      height: "24px",
                      border: "1px solid var(--border-base)",
                      background: "var(--bg-surface)",
                      color: "var(--fg-base)",
                      borderRadius: "4px",
                      padding: 0,
                      fontFamily: "var(--font-mono)",
                      fontSize: "10px",
                      lineHeight: 1,
                      cursor: "pointer",
                    }}
                  >
                    ▶
                  </button>
                </div>
              </div>

              <div style={{ color: "var(--fg-muted)", fontSize: "13px", fontStyle: "italic", lineHeight: 1.32, fontFamily: "Georgia, serif" }}>{`"${card.text}"`}</div>
            </article>
          );
        })}

        {exitingCards.map((card) => {
          const label = referenceLabel(card);
          const confidencePercent = Math.round(card.confidence * 100);
          const confidenceColor = confidenceTone(card.confidence);
          const isPreview = previewReference === label;
          const isLive = liveReference === label;

          return (
            <article
              key={`exit-${card.id}`}
              className="ss-suggestion-exit"
              style={{
                overflow: "hidden",
                border: `1px solid ${isPreview ? "var(--color-primary)" : "var(--border-base)"}`,
                borderLeft: `6px solid ${isLive ? "#00ff9f" : "#ff003b"}`,
                background: "var(--bg-elevated)",
                borderRadius: "12px",
                padding: "10px 12px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px", marginBottom: "6px" }}>
                <div style={{ color: "var(--fg-base)", fontWeight: 800, fontSize: "14px", lineHeight: 1.1, fontFamily: "Georgia, serif" }}>{label}</div>
                <span style={{ color: "var(--fg-muted)", fontFamily: "var(--font-mono)", fontSize: "9px", whiteSpace: "nowrap" }}>
                  Confidence: <span style={{ color: confidenceColor, fontWeight: 700 }}>{confidencePercent}%</span>
                </span>
              </div>
              <div style={{ color: "var(--fg-muted)", fontSize: "13px", fontStyle: "italic", lineHeight: 1.32, fontFamily: "Georgia, serif" }}>{`"${card.text}"`}</div>
            </article>
          );
        })}
      </ScrollArea>
    </div>
  );
}
