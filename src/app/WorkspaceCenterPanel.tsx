import { Suspense } from "react";
import { type DbTable } from "../components/desktop/uiTypes";
import { useProjectorStore, useSuggestionStore, useTranscriptionStore } from "../stores";
import { type ProjectorSlide, type SuggestionCard } from "../types/state";
import { toSlide } from "./helpers";
import { LazyPanelFallback } from "./LazyPanelFallback";
import { AiPanel, BiblePanel, DbInspectorPanel, SuggestionDeckPanel } from "./lazyPanels";
import { passageLibrary } from "./passageLibrary";

export function WorkspaceCenterPanel({
  workspaceTab,
  previewReference,
  dbTables,
  sendLiveCard,
  sendEditedCardLive,
}: {
  workspaceTab: "suggestions" | "bible" | "notes" | "database";
  previewReference: string | null;
  dbTables: DbTable[];
  sendLiveCard: (card: SuggestionCard) => void;
  sendEditedCardLive: (card: SuggestionCard, slide: ProjectorSlide) => void;
}) {
  const transcripts = useTranscriptionStore((s) => s.timeline);
  const cards = useSuggestionStore((s) => s.cards);
  const togglePinnedSuggestion = useSuggestionStore((s) => s.togglePin);
  const dismissSuggestion = useSuggestionStore((s) => s.dismiss);
  const clearSuggestions = useSuggestionStore((s) => s.clear);
  const setPreviewSlide = useProjectorStore((s) => s.setPreview);

  let panel = (
    <Suspense fallback={<LazyPanelFallback />}>
      <SuggestionDeckPanel
        cards={cards}
        previewReference={previewReference}
        onPreview={(card) => setPreviewSlide(toSlide(card))}
        onSendLive={sendLiveCard}
        onSendEditedLive={sendEditedCardLive}
        onTogglePin={(card) => togglePinnedSuggestion(card.id)}
        onDismiss={dismissSuggestion}
        onClearAll={clearSuggestions}
      />
    </Suspense>
  );

  if (workspaceTab === "bible") {
    panel = (
      <Suspense fallback={<LazyPanelFallback />}>
        <BiblePanel passages={passageLibrary} activeReference={previewReference} onPreviewSlide={setPreviewSlide} />
      </Suspense>
    );
  }

  if (workspaceTab === "notes") {
    panel = (
      <Suspense fallback={<LazyPanelFallback />}>
        <AiPanel items={transcripts} pendingCount={cards.filter((card) => card.status === "pending").length} />
      </Suspense>
    );
  }

  if (workspaceTab === "database") {
    panel = (
      <Suspense fallback={<LazyPanelFallback />}>
        <DbInspectorPanel tables={dbTables} />
      </Suspense>
    );
  }

  return <div style={{ height: "100%", minHeight: 0 }}>{panel}</div>;
}
