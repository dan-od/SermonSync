import { useEffect, useMemo, useRef, useState } from "react";

import type { ProjectorSlide, SuggestionCard } from "../types/state";
import { ReferenceEditorModal } from "./suggestionDeck/ReferenceEditorModal";
import { ExitingSuggestionCard, SuggestionDeckCard } from "./suggestionDeck/SuggestionDeckCards";
import { suggestionDeckKeyframes } from "./suggestionDeck/suggestionDeckUtils";

interface SuggestionDeckPanelProps {
  cards: SuggestionCard[];
  previewReference: string | null;
  onPreview: (card: SuggestionCard) => void;
  onSendLive: (card: SuggestionCard) => void;
  onSendEditedLive: (card: SuggestionCard, slide: ProjectorSlide) => void;
  onTogglePin: (card: SuggestionCard) => void;
  onDismiss: (id: string) => void;
  onClearAll: () => void;
}

const PAGE_SIZE = 5;
const MAX_DECK_SIZE = 20;

export function SuggestionDeckPanel({
  cards,
  previewReference,
  onPreview,
  onSendLive,
  onSendEditedLive,
  onTogglePin,
  onDismiss,
  onClearAll,
}: SuggestionDeckPanelProps) {
  const orderedCards = useMemo(() => {
    return [...cards].sort((a, b) => {
      const pinDelta = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
      if (pinDelta !== 0) {
        return pinDelta;
      }
      return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });
  }, [cards]);
  const [renderCount, setRenderCount] = useState(PAGE_SIZE);
  const visibleCards = useMemo(
    () => orderedCards.slice(0, Math.min(renderCount, MAX_DECK_SIZE)),
    [orderedCards, renderCount],
  );
  const [exitingCards, setExitingCards] = useState<SuggestionCard[]>([]);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<SuggestionCard | null>(null);
  const [dismissingCardIds, setDismissingCardIds] = useState<Set<string>>(() => new Set());
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const previousCardsRef = useRef<SuggestionCard[]>(visibleCards);

  const hasMore = visibleCards.length < orderedCards.length;

  const stageCardsForExit = (cardsToExit: SuggestionCard[]) => {
    if (cardsToExit.length === 0) return;
    setExitingCards((current) => {
      const existingIds = new Set(current.map((card) => card.id));
      return [...current, ...cardsToExit.filter((card) => !existingIds.has(card.id))];
    });
    const exitingIds = new Set(cardsToExit.map((card) => card.id));
    window.setTimeout(() => {
      setExitingCards((current) => current.filter((card) => !exitingIds.has(card.id)));
    }, 320);
  };

  const handleClearAll = () => {
    stageCardsForExit(visibleCards);
    previousCardsRef.current = [];
    onClearAll();
  };

  const handleDismiss = (card: SuggestionCard) => {
    if (dismissingCardIds.has(card.id)) return;
    setDismissingCardIds((current) => new Set(current).add(card.id));
    window.setTimeout(() => {
      previousCardsRef.current = previousCardsRef.current.filter((previousCard) => previousCard.id !== card.id);
      setDismissingCardIds((current) => {
        const next = new Set(current);
        next.delete(card.id);
        return next;
      });
      onDismiss(card.id);
    }, 320);
  };

  useEffect(() => {
    const previousCards = previousCardsRef.current;
    const removed = previousCards.filter((prev) => !visibleCards.some((card) => card.id === prev.id));

    if (removed.length > 0) {
      stageCardsForExit(removed);
    }

    previousCardsRef.current = visibleCards;
    return undefined;
  }, [visibleCards]);

  useEffect(() => {
    previousCardsRef.current = visibleCards;
  }, [visibleCards]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    viewport.style.scrollBehavior = "smooth";

    const onScroll = () => {
      if (!hasMore) {
        return;
      }
      const remaining = viewport.scrollHeight - (viewport.scrollTop + viewport.clientHeight);
      if (remaining < 180) {
        setRenderCount((current) => Math.min(current + PAGE_SIZE, Math.min(orderedCards.length, MAX_DECK_SIZE)));
      }
    };

    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", onScroll);
  }, [hasMore, orderedCards.length]);

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
      <style>{suggestionDeckKeyframes}</style>

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
          onClick={handleClearAll}
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

      <div
        ref={viewportRef}
        className="scripture-scroll-pane"
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          paddingRight: "4px",
          paddingBottom: "2px",
          scrollbarGutter: "stable",
        }}
      >
        {visibleCards.map((card) => (
          <SuggestionDeckCard
            key={card.id}
            card={card}
            previewReference={previewReference}
            isHovered={hoveredCardId === card.id}
            isDismissing={dismissingCardIds.has(card.id)}
            onPreview={onPreview}
            onSendLive={onSendLive}
            onHoverStart={() => setHoveredCardId(card.id)}
            onHoverEnd={() => setHoveredCardId((current) => (current === card.id ? null : current))}
            onEdit={setEditingCard}
            onTogglePin={onTogglePin}
            onDismiss={handleDismiss}
          />
        ))}

        {exitingCards.map((card) => (
          <ExitingSuggestionCard key={`exit-${card.id}`} card={card} previewReference={previewReference} />
        ))}
      </div>
      {editingCard && (
        <ReferenceEditorModal
          card={editingCard}
          onClose={() => setEditingCard(null)}
          onSendLive={(slide) => {
            onSendEditedLive(editingCard, slide);
            setEditingCard(null);
          }}
        />
      )}
    </div>
  );
}
