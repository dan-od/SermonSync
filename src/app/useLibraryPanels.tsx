import { Suspense, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { LibraryNavigationHandler, LibraryTab, ScriptureSearchMode } from "../components/Library/types";
import { useProjectorStore } from "../stores";
import { type Song } from "../stores/songStore";
import { type ProjectorSlide } from "../types/state";
import { type LibraryScheduleItem } from "./types";
import { LazyPanelFallback } from "./LazyPanelFallback";
import { LocalLibrarySearch } from "./LocalLibrarySearch";
import { LocalLibraryPanel } from "./lazyPanels";
import { useLibrarySchedule } from "./useLibrarySchedule";

export function useLibraryPanels({
  libraryTab,
  setLibraryTab,
  librarySearchQuery,
  setLibrarySearchQuery,
  librarySearchMode,
  setLibrarySearchMode,
  selectedScripture,
  setSelectedScripture,
  selectedLibrarySong,
  setSelectedLibrarySong,
  setActiveCue,
  previewReference,
  liveReference,
  libraryNavigationRef,
}: {
  libraryTab: LibraryTab;
  setLibraryTab: (tab: LibraryTab) => void;
  librarySearchQuery: string;
  setLibrarySearchQuery: Dispatch<SetStateAction<string>>;
  librarySearchMode: ScriptureSearchMode;
  setLibrarySearchMode: (mode: ScriptureSearchMode) => void;
  selectedScripture: ProjectorSlide | null;
  setSelectedScripture: (slide: ProjectorSlide | null) => void;
  selectedLibrarySong: Song | null;
  setSelectedLibrarySong: (song: Song | null) => void;
  setActiveCue: Dispatch<SetStateAction<LibraryScheduleItem | null>>;
  previewReference: string | null;
  liveReference: string | null;
  libraryNavigationRef: RefObject<LibraryNavigationHandler | null>;
}) {
  const previewMedia = useProjectorStore((s) => s.previewMedia);
  const liveMedia = useProjectorStore((s) => s.liveMedia);
  const setPreviewSlide = useProjectorStore((s) => s.setPreview);
  const setPreviewMedia = useProjectorStore((s) => s.setPreviewMedia);
  const sendLiveSlide = useProjectorStore((s) => s.sendLive);
  const sendLiveMedia = useProjectorStore((s) => s.sendLiveMedia);

  const {
    librarySchedule,
    addLibraryScheduleItem,
    removeLibraryScheduleItem,
    reorderLibrarySchedule,
    addCueToSchedule,
    openCueFromSchedule,
    previewScheduledItem,
    sendScheduledItemLive,
  } = useLibrarySchedule({
    libraryTab,
    librarySearchQuery,
    librarySearchMode,
    setLibrarySearchQuery,
    selectedScripture,
    selectedLibrarySong,
    setActiveCue,
    setPreviewSlide,
    sendLiveSlide,
  });

  const library = (
    <Suspense fallback={<LazyPanelFallback />}>
      <LocalLibraryPanel
        previewReference={previewReference}
        liveReference={liveReference}
        previewMedia={previewMedia}
        liveMedia={liveMedia}
        activeTab={libraryTab}
        searchQuery={librarySearchQuery}
        searchMode={librarySearchMode}
        onActiveTabChange={setLibraryTab}
        onPreviewSlide={setPreviewSlide}
        onSendLive={sendLiveSlide}
        onPreviewMedia={setPreviewMedia}
        onSendMedia={sendLiveMedia}
        onSelectedScriptureChange={setSelectedScripture}
        onSelectedSongChange={setSelectedLibrarySong}
        onCreateCue={addCueToSchedule}
        onNavigationHandlerChange={(handler) => {
          libraryNavigationRef.current = handler;
        }}
      />
    </Suspense>
  );

  const librarySidePanel = (
    <LocalLibrarySearch
      activeTab={libraryTab}
      searchQuery={librarySearchQuery}
      selectedSong={selectedLibrarySong}
      onSearchQueryChange={(value) => { setSelectedScripture(null); setLibrarySearchQuery(value); }}
      searchMode={librarySearchMode}
      onSearchModeChange={setLibrarySearchMode}
      scheduledItems={librarySchedule}
      selectedScripture={selectedScripture}
      onAddToSchedule={addLibraryScheduleItem}
      onRemoveFromSchedule={removeLibraryScheduleItem}
      onReorderSchedule={reorderLibrarySchedule}
      onSchedulePreview={previewScheduledItem}
      onScheduleLive={sendScheduledItemLive}
      onOpenCue={openCueFromSchedule}
    />
  );

  return { library, librarySidePanel };
}
