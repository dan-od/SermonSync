import { useEffect, useMemo, useRef, useState } from "react";

import { lookupScriptureVerse } from "../lib/sidecarClient";
import { useConfigStore } from "../stores/configStore";
import type { ProjectorSlide, SuggestionCard } from "../types/state";

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
        {visibleCards.map((card) => {
          const label = referenceLabel(card);
          const confidencePercent = Math.round(card.confidence * 100);
          const confidenceColor = confidenceTone(card.confidence);
          const isPreview = previewReference === label;
          const isHovered = hoveredCardId === card.id;
          const isDismissing = dismissingCardIds.has(card.id);
          const previewRing = isPreview ? "inset 0 0 0 1px rgba(123, 47, 247, 0.2)" : "none";
          const hoverGlow = isHovered ? "0 0 0 1px rgba(255, 75, 96, 0.82), 0 0 8px rgba(255, 36, 74, 0.35)" : "none";
          const accentColor = card.status === "sent" ? "var(--color-success)" : card.status === "dismissed" ? "var(--fg-subtle)" : "var(--color-error)";

          return (
            <article
              key={card.id}
              onClick={() => onPreview(card)}
              onDoubleClick={() => onSendLive(card)}
              onMouseEnter={() => setHoveredCardId(card.id)}
              onMouseLeave={() => setHoveredCardId((current) => (current === card.id ? null : current))}
              style={{
                position: "relative",
                overflow: "hidden",
                border: isPreview ? "1px solid var(--color-primary)" : "none",
                background: "var(--bg-elevated)",
                borderRadius: "12px",
                padding: "8px 10px 8px 16px",
                flexShrink: 0,
                boxShadow: hoverGlow !== "none" ? `${previewRing !== "none" ? `${previewRing}, ` : ""}${hoverGlow}` : previewRing,
                cursor: "pointer",
                transition: "box-shadow 140ms ease",
              }}
              className={isDismissing ? "ss-suggestion-exit" : "ss-suggestion-enter"}
            >
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: "6px",
                  background: accentColor,
                  boxShadow: `0 0 10px color-mix(in srgb, ${accentColor} 60%, transparent)`,
                }}
              />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "6px" }}>
                <div style={{ minWidth: 0, color: "var(--fg-base)", fontWeight: 800, fontSize: "14px", lineHeight: 1.1, fontFamily: "Georgia, serif", overflowWrap: "anywhere" }}>{label}</div>
                <div style={{ display: "flex", flexShrink: 0, alignItems: "center", gap: "6px" }}>
                  <span style={{ color: "var(--fg-muted)", fontFamily: "var(--font-mono)", fontSize: "9px", whiteSpace: "nowrap" }}>
                    Confidence: <span style={{ color: confidenceColor, fontWeight: 700 }}>{confidencePercent}%</span>
                  </span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setEditingCard(card);
                    }}
                    onDoubleClick={(event) => event.stopPropagation()}
                    title="Edit reference"
                    aria-label={`Edit reference for ${label}`}
                    style={{
                      flex: "0 0 24px",
                      width: "24px",
                      height: "24px",
                      border: "none",
                      background: "transparent",
                      color: "var(--fg-base)",
                      padding: 0,
                      cursor: "pointer",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M12 20h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onTogglePin(card);
                    }}
                    onDoubleClick={(event) => event.stopPropagation()}
                    title={card.pinned ? "Unpin suggestion" : "Pin suggestion"}
                    aria-label={card.pinned ? `Unpin ${label}` : `Pin ${label}`}
                    style={{
                      flex: "0 0 24px",
                      width: "24px",
                      height: "24px",
                      border: "none",
                      background: "transparent",
                      color: card.pinned ? "var(--color-primary)" : "var(--fg-base)",
                      padding: 0,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill={card.pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 17v5M9 2h6l-1 5h3l-2 7H9L7 7h3L9 2z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDismiss(card);
                    }}
                    onDoubleClick={(event) => event.stopPropagation()}
                    title="Dismiss suggestion"
                    aria-label={`Dismiss ${label}`}
                    style={{
                      flex: "0 0 24px",
                      width: "24px",
                      height: "24px",
                      border: "none",
                      background: "transparent",
                      color: "var(--fg-muted)",
                      padding: 0,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
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
                      flex: "0 0 24px",
                      width: "24px",
                      height: "24px",
                      border: "none",
                      background: "transparent",
                      color: "var(--fg-base)",
                      padding: 0,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <polygon points="6,4 20,12 6,20" />
                    </svg>
                  </button>
                </div>
              </div>

              <div
                style={{
                  color: "var(--fg-muted)",
                  fontSize: "12px",
                  fontStyle: "italic",
                  lineHeight: 1.32,
                  fontFamily: "Georgia, serif",
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: 2,
                  overflow: "hidden",
                }}
              >
                {card.text}
              </div>
            </article>
          );
        })}

        {exitingCards.map((card) => {
          const label = referenceLabel(card);
          const confidencePercent = Math.round(card.confidence * 100);
          const confidenceColor = confidenceTone(card.confidence);
          const isPreview = previewReference === label;
          const accentColor = card.status === "sent" ? "var(--color-success)" : card.status === "dismissed" ? "var(--fg-subtle)" : "var(--color-error)";

          return (
            <article
              key={`exit-${card.id}`}
              className="ss-suggestion-exit"
              style={{
                position: "relative",
                overflow: "hidden",
                border: isPreview ? "1px solid var(--color-primary)" : "none",
                background: "var(--bg-elevated)",
                borderRadius: "12px",
                padding: "8px 10px 8px 16px",
                flexShrink: 0,
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: "6px",
                  background: accentColor,
                  boxShadow: `0 0 10px color-mix(in srgb, ${accentColor} 60%, transparent)`,
                }}
              />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px", marginBottom: "6px" }}>
                <div style={{ color: "var(--fg-base)", fontWeight: 800, fontSize: "14px", lineHeight: 1.1, fontFamily: "Georgia, serif" }}>{label}</div>
                <span style={{ color: "var(--fg-muted)", fontFamily: "var(--font-mono)", fontSize: "9px", whiteSpace: "nowrap" }}>
                  Confidence: <span style={{ color: confidenceColor, fontWeight: 700 }}>{confidencePercent}%</span>
                </span>
              </div>
              <div
                style={{
                  color: "var(--fg-muted)",
                  fontSize: "12px",
                  fontStyle: "italic",
                  lineHeight: 1.32,
                  fontFamily: "Georgia, serif",
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: 2,
                  overflow: "hidden",
                }}
              >
                {card.text}
              </div>
            </article>
          );
        })}
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

function ReferenceEditorModal({
  card,
  onClose,
  onSendLive,
}: {
  card: SuggestionCard;
  onClose: () => void;
  onSendLive: (slide: ProjectorSlide) => void;
}) {
  const configuredVersions = useConfigStore((state) => state.bibleVersions);
  const [book, setBook] = useState(card.reference.book);
  const [chapter, setChapter] = useState(String(card.reference.chapter));
  const [verse, setVerse] = useState(String(card.reference.verse));
  const [version, setVersion] = useState(card.version);
  const [preview, setPreview] = useState<ProjectorSlide | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const versions = useMemo(() => {
    const available = configuredVersions.filter((entry) => entry.available);
    return available.some((entry) => entry.abbreviation === card.version)
      ? available
      : [{ abbreviation: card.version, name: card.version, verse_count: 0, available: true }, ...available];
  }, [card.version, configuredVersions]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      const chapterNumber = Number.parseInt(chapter, 10);
      const verseNumber = Number.parseInt(verse, 10);
      const normalizedBook = book.trim();
      if (!normalizedBook || chapterNumber < 1 || verseNumber < 1) {
        if (!active) return;
        setPreview(null);
        setError("Enter a book, chapter, and verse.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      const result = await lookupScriptureVerse(normalizedBook, chapterNumber, verseNumber, version);
      if (!active) return;
      if (!result) {
        setPreview(null);
        setError("This reference is not available in the selected version.");
        setIsLoading(false);
        return;
      }
      setPreview({
        reference: { book: result.book, chapter: result.chapter, verse: result.verse },
        text: result.text,
        version: result.version,
      });
      setIsLoading(false);
    });

    return () => {
      active = false;
    };
  }, [book, chapter, verse, version]);

  const inputStyle: React.CSSProperties = {
    boxSizing: "border-box",
    width: "100%",
    minWidth: 0,
    border: "1px solid var(--border-base)",
    borderRadius: "var(--radius-sm)",
    background: "var(--bg-base)",
    color: "var(--fg-base)",
    padding: "8px 9px",
    fontSize: "var(--text-xs)",
    fontFamily: "var(--font-sans)",
  };

  return (
    <div
      role="presentation"
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        padding: "var(--space-4)",
        background: "rgba(0, 0, 0, 0.6)",
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-reference-title"
        onMouseDown={(event) => event.stopPropagation()}
        style={{
          width: "min(100%, 560px)",
          maxHeight: "min(640px, calc(100vh - 32px))",
          overflow: "auto",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border-base)" }}>
          <div>
            <div id="edit-reference-title" style={{ color: "var(--fg-base)", fontWeight: 700, fontSize: "var(--text-sm)" }}>Edit Reference</div>
            <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)", marginTop: 2 }}>Correct the match before sending it live.</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close editor" title="Close" style={{ border: "none", background: "transparent", color: "var(--fg-muted)", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: "grid", gap: "var(--space-3)", padding: "16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 84px 84px", gap: "var(--space-2)" }}>
            <label style={{ display: "grid", gap: 5, color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>Book<input autoFocus value={book} onChange={(event) => setBook(event.target.value)} style={inputStyle} /></label>
            <label style={{ display: "grid", gap: 5, color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>Chapter<input type="number" min="1" value={chapter} onChange={(event) => setChapter(event.target.value)} style={inputStyle} /></label>
            <label style={{ display: "grid", gap: 5, color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>Verse<input type="number" min="1" value={verse} onChange={(event) => setVerse(event.target.value)} style={inputStyle} /></label>
          </div>
          <label style={{ display: "grid", gap: 5, color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
            Version
            <select value={version} onChange={(event) => setVersion(event.target.value)} style={inputStyle}>
              {versions.map((entry) => <option key={entry.abbreviation} value={entry.abbreviation}>{entry.abbreviation} - {entry.name}</option>)}
            </select>
          </label>
          <div style={{ border: "1px solid var(--border-base)", borderRadius: "var(--radius-sm)", background: "var(--bg-base)", padding: "12px", minHeight: 104 }}>
            <div style={{ color: "var(--color-primary)", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", marginBottom: 7 }}>VERSE PREVIEW</div>
            {isLoading ? <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>Loading verse...</div> : error ? <div style={{ color: "var(--color-error)", fontSize: "var(--text-xs)" }}>{error}</div> : preview && <><div style={{ color: "var(--fg-base)", fontFamily: "Georgia, serif", fontSize: "var(--text-sm)", lineHeight: 1.5 }}>{preview.text}</div><div style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)", marginTop: 8 }}>{referenceLabel({ ...card, ...preview })} - {preview.version}</div></>}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
            <button type="button" onClick={onClose} style={{ border: "1px solid var(--border-base)", borderRadius: "var(--radius-sm)", background: "transparent", color: "var(--fg-base)", padding: "8px 12px", cursor: "pointer", fontSize: "var(--text-xs)" }}>Cancel</button>
            <button type="button" disabled={!preview || isLoading} onClick={() => preview && onSendLive(preview)} style={{ border: "1px solid var(--color-primary)", borderRadius: "var(--radius-sm)", background: preview && !isLoading ? "var(--color-primary)" : "var(--bg-elevated)", color: preview && !isLoading ? "#fff" : "var(--fg-subtle)", padding: "8px 12px", cursor: preview && !isLoading ? "pointer" : "not-allowed", fontSize: "var(--text-xs)", fontWeight: 700 }}>Send Corrected Verse Live</button>
          </div>
        </div>
      </section>
    </div>
  );
}
