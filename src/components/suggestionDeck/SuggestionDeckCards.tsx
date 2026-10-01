import type { SuggestionCard } from "../../types/state";
import { confidenceTone, referenceLabel } from "./suggestionDeckUtils";

interface SuggestionDeckCardProps {
  card: SuggestionCard;
  previewReference: string | null;
  isHovered: boolean;
  isDismissing: boolean;
  onPreview: (card: SuggestionCard) => void;
  onSendLive: (card: SuggestionCard) => void;
  onHoverStart: () => void;
  onHoverEnd: () => void;
  onEdit: (card: SuggestionCard) => void;
  onTogglePin: (card: SuggestionCard) => void;
  onDismiss: (card: SuggestionCard) => void;
}

export function SuggestionDeckCard({
  card,
  previewReference,
  isHovered,
  isDismissing,
  onPreview,
  onSendLive,
  onHoverStart,
  onHoverEnd,
  onEdit,
  onTogglePin,
  onDismiss,
}: SuggestionDeckCardProps) {
  const label = referenceLabel(card);
  const confidencePercent = Math.round(card.confidence * 100);
  const confidenceColor = confidenceTone(card.confidence);
  const isPreview = previewReference === label;
  const previewRing = isPreview ? "inset 0 0 0 1px rgba(123, 47, 247, 0.2)" : "none";
  const hoverGlow = isHovered ? "0 0 0 1px rgba(255, 75, 96, 0.82), 0 0 8px rgba(255, 36, 74, 0.35)" : "none";
  const accentColor = card.status === "sent" ? "var(--color-success)" : card.status === "dismissed" ? "var(--fg-subtle)" : "var(--color-error)";

  return (
    <article
      onClick={() => onPreview(card)}
      onDoubleClick={() => onSendLive(card)}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
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
              onEdit(card);
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
              onDismiss(card);
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
}

export function ExitingSuggestionCard({ card, previewReference }: { card: SuggestionCard; previewReference: string | null }) {
  const label = referenceLabel(card);
  const confidencePercent = Math.round(card.confidence * 100);
  const confidenceColor = confidenceTone(card.confidence);
  const isPreview = previewReference === label;
  const accentColor = card.status === "sent" ? "var(--color-success)" : card.status === "dismissed" ? "var(--fg-subtle)" : "var(--color-error)";

  return (
    <article
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
}
