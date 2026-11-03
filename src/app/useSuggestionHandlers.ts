import { useProjectorStore, useSuggestionStore, useTranscriptionStore } from "../stores";
import { type ProjectorSlide, type SuggestionCard } from "../types/state";
import { formatReference, toSlide } from "./helpers";
import { passageLibrary } from "./passageLibrary";

export function useSuggestionHandlers(setWorkspaceTab: (tab: "suggestions") => void) {
  const addManualTimelineItem = useTranscriptionStore((s) => s.addManualTimelineItem);
  const addCards = useSuggestionStore((s) => s.addCards);
  const updateCardStatus = useSuggestionStore((s) => s.updateStatus);
  const setPreviewSlide = useProjectorStore((s) => s.setPreview);
  const sendLiveSlide = useProjectorStore((s) => s.sendLive);

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
