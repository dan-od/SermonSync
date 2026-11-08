import type { SuggestionCard } from "../../types/state";

export function referenceLabel(card: SuggestionCard) {
  return `${card.reference.book} ${card.reference.chapter}:${card.reference.verse}`;
}

export function confidenceTone(confidence: number) {
  const percent = Math.round(confidence * 100);
  if (percent <= 39) {
    return "#b91c1c";
  }
  if (percent <= 79) {
    return "#a16207";
  }
  return "#166534";
}

export const MAX_DECK_SIZE = 20;

export const SUGGESTION_DECK_CSS = `
        .ss-suggestion-enter {
          animation: ssSuggestionEnter 150ms ease-out;
        }

        .ss-suggestion-exit {
          animation: ssSuggestionExit 300ms cubic-bezier(0.4, 0, 1, 1) both;
        }

        .ss-suggestion-action {
          border: none;
          border-radius: var(--radius-sm);
          background: transparent;
          color: var(--fg-base);
          transition: background 120ms ease, color 120ms ease;
        }

        .ss-suggestion-action:hover,
        .ss-suggestion-action:focus-visible {
          background: var(--color-primary);
          color: var(--fg-on-accent);
          outline: none;
        }

        .ss-suggestion-action.is-pinned { color: var(--color-primary); }
        .ss-suggestion-action.is-sent {
          background: var(--color-primary);
          color: var(--fg-on-accent);
        }

        .ss-suggestion-action:disabled,
        .ss-suggestion-action:disabled:hover {
          background: transparent;
          color: var(--fg-subtle);
          cursor: not-allowed;
        }

        @keyframes ssSuggestionEnter {
          from { opacity: 0; }
          to { opacity: 1; }
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
      `;
