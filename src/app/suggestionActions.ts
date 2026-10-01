import { useProjectorStore, useSuggestionStore, useTranscriptionStore } from "../stores";
import type { ProjectorSlide, SuggestionCard } from "../types/state";
import { passageLibrary } from "./passageLibrary";
import { formatReference, toSlide } from "./slideHelpers";
import type { WorkspaceTab } from "./types";

type ProjectorStoreState = ReturnType<typeof useProjectorStore.getState>;
type SuggestionStoreState = ReturnType<typeof useSuggestionStore.getState>;

/**
 * Manual-transcript and suggestion-card handlers. Plain closures (no hooks),
 * rebuilt on every App render exactly as the inline versions were.
 */
export function createSuggestionActions({
  addManualTimelineItem,
  addCards,
  updateCardStatus,
  setPreviewSlide,
  sendLiveSlide,
  setWorkspaceTab,
}: {
  addManualTimelineItem: ReturnType<typeof useTranscriptionStore.getState>["addManualTimelineItem"];
  addCards: SuggestionStoreState["addCards"];
  updateCardStatus: SuggestionStoreState["updateStatus"];
  setPreviewSlide: ProjectorStoreState["setPreview"];
  sendLiveSlide: ProjectorStoreState["sendLive"];
  setWorkspaceTab: (tab: WorkspaceTab) => void;
}) {
  const addManualTranscript = (text: string) => {
    const normalized = text.toLowerCase();
    const matches = passageLibrary
      .filter((passage) => `${formatReference(passage)} ${passage.searchText}`.toLowerCase().includes(normalized))
      .map((passage) => formatReference(passage));

    addManualTimelineItem(text, matches);

    if (matches.length === 0) {
      return;
    }

    const newCards = passageLibrary
      .filter((passage) => matches.includes(formatReference(passage)))
      .map<SuggestionCard>((passage, index) => ({
        id: `c-${Date.now()}-${index}`,
        reference: passage.reference,
        text: passage.text,
        confidence: 0.82,
        pipelineStage: 2,
        status: "pending",
        version: passage.version,
        themes: passage.themes,
        createdAt: Date.now(),
        pinned: false,
      }));

    addCards(newCards);
    setPreviewSlide(toSlide(newCards[0]));
    setWorkspaceTab("suggestions");
  };

  const sendLiveCard = (card: SuggestionCard) => {
    const slide = toSlide(card);
    sendLiveSlide(slide);
    updateCardStatus(card.id, "sent");
  };

  const sendEditedCardLive = (card: SuggestionCard, slide: ProjectorSlide) => {
    sendLiveSlide(slide);
    updateCardStatus(card.id, "edited");
  };

  return { addManualTranscript, sendLiveCard, sendEditedCardLive };
}
