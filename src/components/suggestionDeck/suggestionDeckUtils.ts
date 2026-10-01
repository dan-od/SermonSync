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

export const suggestionDeckKeyframes = `
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
      `;
