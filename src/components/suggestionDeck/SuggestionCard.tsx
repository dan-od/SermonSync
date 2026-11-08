import type { SuggestionCard } from "../../types/state";
import { confidenceTone, referenceLabel } from "./suggestionDeckUtils";

export function SuggestionCardView({
  card,
  previewReference,
  onPreview,
  onSendLive,
  onEdit,
  onTogglePin,
  onDismiss,
}: {
  card: SuggestionCard;
  previewReference: string | null;
  onPreview: (card: SuggestionCard) => void;
  onSendLive: (card: SuggestionCard) => void;
  onEdit: (card: SuggestionCard) => void;
  onTogglePin: (card: SuggestionCard) => void;
  onDismiss: (card: SuggestionCard) => void;
}) {
  const label = referenceLabel(card);
  const confidencePercent = Math.round(card.confidence * 100);
  const confidenceColor = confidenceTone(card.confidence);
  const isPreview = previewReference === label;
  const previewRing = isPreview ? "inset 0 0 0 1px rgba(123, 47, 247, 0.2)" : "none";

  return (
    <article
      onClick={() => onPreview(card)}
      onDoubleClick={() => onSendLive(card)}
      style={{
        position: "relative",
        border: isPreview ? "1px solid var(--color-primary)" : "none",
        background: "var(--bg-elevated)",
        borderRadius: 0,
        padding: "8px 10px",
        flexShrink: 0,
        minWidth: 0,
        boxSizing: "border-box",
        boxShadow: previewRing,
        cursor: "pointer",
      }}
      className="ss-suggestion-enter"
    >
      <div style={{ marginBottom: "6px", minWidth: 0, color: "var(--fg-base)", fontWeight: 800, fontSize: "14px", lineHeight: 1.1, fontFamily: "Georgia, serif", overflowWrap: "break-word" }}>
        {label}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "6px", marginBottom: "6px", minWidth: 0 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px", minWidth: 0 }}>
          <button
            type="button"
            className="ss-suggestion-action"
            onClick={(event) => {
              event.stopPropagation();
              onEdit(card);
            }}
            onDoubleClick={(event) => event.stopPropagation()}
            title="Edit reference"
            aria-label={`Edit reference for ${label}`}
            style={{
              flex: "0 0 26px",
              width: "26px",
              height: "26px",
              padding: 0,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 20h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            className={`ss-suggestion-action${card.pinned ? " is-pinned" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              onTogglePin(card);
            }}
            onDoubleClick={(event) => event.stopPropagation()}
            title={card.pinned ? "Unpin suggestion" : "Pin suggestion"}
            aria-label={card.pinned ? `Unpin ${label}` : `Pin ${label}`}
            style={{
              flex: "0 0 26px",
              width: "26px",
              height: "26px",
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
            className="ss-suggestion-action"
            onClick={(event) => {
              event.stopPropagation();
              onDismiss(card);
            }}
            onDoubleClick={(event) => event.stopPropagation()}
            title="Dismiss suggestion"
            aria-label={`Dismiss ${label}`}
            style={{
              flex: "0 0 26px",
              width: "26px",
              height: "26px",
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
            className={`ss-suggestion-action${card.status === "sent" ? " is-sent" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              onSendLive(card);
            }}
            onDoubleClick={(event) => event.stopPropagation()}
            title={card.status === "sent" ? "Sent live" : "Send live"}
            aria-label={card.status === "sent" ? `${label} sent live` : `Send ${label} live`}
            aria-pressed={card.status === "sent"}
            style={{
              minHeight: "26px",
              padding: "0 8px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px",
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            {card.status === "sent" ? "SENT" : "SEND LIVE"}
          </button>
        </div>
        <span style={{ marginLeft: "auto", color: "var(--fg-muted)", fontFamily: "var(--font-mono)", fontSize: "9px", whiteSpace: "nowrap" }}>
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
          overflowWrap: "anywhere",
        }}
      >
        {card.text}
      </div>
    </article>
  );
}

export function ExitingSuggestionCard({
  card,
  previewReference,
}: {
  card: SuggestionCard;
  previewReference: string | null;
}) {
  const label = referenceLabel(card);
  const confidencePercent = Math.round(card.confidence * 100);
  const confidenceColor = confidenceTone(card.confidence);
  const isPreview = previewReference === label;

  return (
    <article
      className="ss-suggestion-exit"
      style={{
        position: "relative",
        overflow: "hidden",
        pointerEvents: "none",
        border: isPreview ? "1px solid var(--color-primary)" : "none",
        background: "var(--bg-elevated)",
        borderRadius: 0,
        padding: "8px 10px",
        flexShrink: 0,
      }}
    >
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
          overflowWrap: "anywhere",
        }}
      >
        {card.text}
      </div>
    </article>
  );
}
