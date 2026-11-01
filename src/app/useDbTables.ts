import { useMemo } from "react";
import { type DbTable } from "../components/desktop/uiTypes";
import { useProjectorStore, useSuggestionStore, useTranscriptionStore } from "../stores";
import { formatReference } from "./helpers";

export function useDbTables(overlayMode: ReturnType<typeof useProjectorStore.getState>["overlayMode"]) {
  const transcripts = useTranscriptionStore((s) => s.timeline);
  const cards = useSuggestionStore((s) => s.cards);
  const previewSlide = useProjectorStore((s) => s.previewSlide);
  const liveSlide = useProjectorStore((s) => s.liveSlide);
  const projectorTheme = useProjectorStore((s) => s.theme);

  return useMemo<DbTable[]>(() => {
    return [
      {
        name: "transcripts",
        description: "Recent transcript feed items",
        columns: ["id", "timestamp", "speaker", "text", "matches"],
        rows: transcripts.map((entry) => ({
          id: entry.id,
          timestamp: entry.timestamp,
          speaker: entry.speaker,
          text: entry.text,
          matches: entry.matches.join(", "),
        })),
      },
      {
        name: "suggestions",
        description: "Scripture cards currently in the queue",
        columns: ["id", "reference", "status", "confidence", "pipelineStage"],
        rows: cards.map((card) => ({
          id: card.id,
          reference: formatReference(card),
          status: card.status,
          confidence: Math.round(card.confidence * 100),
          pipelineStage: card.pipelineStage,
        })),
      },
      {
        name: "projector",
        description: "Current preview and live output state",
        columns: ["channel", "reference", "overlayMode", "theme"],
        rows: [
          {
            channel: "preview",
            reference: previewSlide ? formatReference(previewSlide) : "none",
            overlayMode,
            theme: projectorTheme,
          },
          {
            channel: "live",
            reference: liveSlide ? formatReference(liveSlide) : "none",
            overlayMode,
            theme: projectorTheme,
          },
        ],
      },
    ];
  }, [cards, liveSlide, overlayMode, previewSlide, projectorTheme, transcripts]);
}
