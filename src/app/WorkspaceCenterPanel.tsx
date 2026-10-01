import { Suspense, lazy } from "react";

import type { DbTable } from "../components/desktop/uiTypes";
import type { ProjectorSlide, SuggestionCard, TranscriptItem } from "../types/state";
import { passageLibrary } from "./passageLibrary";
import { LazyPanelFallback } from "./LazyPanelFallback";
import type { WorkspaceTab } from "./types";

const AiPanel = lazy(() => import("../components/AiPanel").then((module) => ({ default: module.AiPanel })));
const BiblePanel = lazy(() => import("../components/BiblePanel").then((module) => ({ default: module.BiblePanel })));
const DbInspectorPanel = lazy(() => import("../components/DbInspectorPanel").then((module) => ({ default: module.DbInspectorPanel })));
const SuggestionDeckPanel = lazy(() =>
  import("../components/SuggestionDeckPanel").then((module) => ({ default: module.SuggestionDeckPanel })),
);

interface WorkspaceCenterPanelProps {
  workspaceTab: WorkspaceTab;
  cards: SuggestionCard[];
  transcripts: TranscriptItem[];
  dbTables: DbTable[];
  previewReference: string | null;
  onPreviewCard: (card: SuggestionCard) => void;
  onSendLive: (card: SuggestionCard) => void;
  onSendEditedLive: (card: SuggestionCard, slide: ProjectorSlide) => void;
  onTogglePin: (card: SuggestionCard) => void;
  onDismiss: (id: string) => void;
  onClearAll: () => void;
  onPreviewSlide: (slide: ProjectorSlide) => void;
}

export function WorkspaceCenterPanel({
  workspaceTab,
  cards,
  transcripts,
  dbTables,
  previewReference,
  onPreviewCard,
  onSendLive,
  onSendEditedLive,
  onTogglePin,
  onDismiss,
  onClearAll,
  onPreviewSlide,
}: WorkspaceCenterPanelProps) {
  let panel = (
    <Suspense fallback={<LazyPanelFallback />}>
      <SuggestionDeckPanel
        cards={cards}
        previewReference={previewReference}
        onPreview={onPreviewCard}
        onSendLive={onSendLive}
        onSendEditedLive={onSendEditedLive}
        onTogglePin={onTogglePin}
        onDismiss={onDismiss}
        onClearAll={onClearAll}
      />
    </Suspense>
  );

  if (workspaceTab === "bible") {
    panel = (
      <Suspense fallback={<LazyPanelFallback />}>
        <BiblePanel passages={passageLibrary} activeReference={previewReference} onPreviewSlide={onPreviewSlide} />
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
