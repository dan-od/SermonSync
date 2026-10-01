import type { DbTable } from "../components/desktop/uiTypes";
import type { OverlayMode, ProjectorSlide, SuggestionCard, TranscriptItem, VerseTheme } from "../types/state";
import { formatReference } from "./slideHelpers";

export function buildDbTables({
  transcripts,
  cards,
  previewSlide,
  liveSlide,
  overlayMode,
  projectorTheme,
}: {
  transcripts: TranscriptItem[];
  cards: SuggestionCard[];
  previewSlide: ProjectorSlide | null;
  liveSlide: ProjectorSlide | null;
  overlayMode: OverlayMode;
  projectorTheme: VerseTheme;
}): DbTable[] {
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
}
