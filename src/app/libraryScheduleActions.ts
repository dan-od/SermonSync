import type { Dispatch, SetStateAction } from "react";

import type { LibraryTab, ScriptureSearchMode } from "../components/LocalLibraryPanel";
import { knownScriptureBooks, matchScriptureReferenceIncremental, resolveScriptureSearch } from "../lib/scriptureSearch";
import { useProjectorStore } from "../stores";
import type { ProjectorSlide } from "../types/state";
import { toScheduledSlide } from "./slideHelpers";
import type { LibraryScheduleItem } from "./types";

type ProjectorStoreState = ReturnType<typeof useProjectorStore.getState>;

/**
 * Schedule handlers for the library side panel. Plain closures (no hooks),
 * rebuilt on every App render exactly as the inline versions were.
 */
export function createLibraryScheduleActions({
  libraryTab,
  librarySearchQuery,
  librarySearchMode,
  setLibrarySearchQuery,
  setLibrarySchedule,
  setActiveCue,
  setPreviewSlide,
  sendLiveSlide,
}: {
  libraryTab: LibraryTab;
  librarySearchQuery: string;
  librarySearchMode: ScriptureSearchMode;
  setLibrarySearchQuery: Dispatch<SetStateAction<string>>;
  setLibrarySchedule: Dispatch<SetStateAction<LibraryScheduleItem[]>>;
  setActiveCue: Dispatch<SetStateAction<LibraryScheduleItem | null>>;
  setPreviewSlide: ProjectorStoreState["setPreview"];
  sendLiveSlide: ProjectorStoreState["sendLive"];
}) {
  const addLibraryScheduleItem = (slide?: ProjectorSlide) => {
    if (slide) {
      const kind = slide.version === "Lyrics" || slide.version === "SONG" ? "songs" : "scriptures";
      const value = kind === "scriptures" ? `${slide.reference.book} ${slide.reference.chapter}:${slide.reference.verse}` : slide.text;
      setLibrarySchedule((current) => current.some((item) => item.kind === kind && item.value.toLowerCase() === value.toLowerCase())
        ? current
        : [...current, { id: `${kind}-${Date.now()}-${current.length}`, kind, value }]);
      return;
    }
    const normalized = librarySearchQuery.trim();
    if (!normalized || (libraryTab !== "scriptures" && libraryTab !== "songs")) {
      return;
    }

    let nextValue = normalized;
    let resolved = true;
    if (libraryTab === "scriptures") {
      if (librarySearchMode === "reference") {
        const match = matchScriptureReferenceIncremental(normalized, knownScriptureBooks);
        if (match.matchedBook && match.chapter != null && match.verse != null) {
          nextValue = `${match.matchedBook} ${match.chapter}:${match.verse}`;
        } else {
          resolved = false;
        }
      } else {
        const wordsMatch = resolveScriptureSearch(normalized);
        nextValue = wordsMatch?.value ?? normalized;
        resolved = Boolean(wordsMatch);
      }
    }

    setLibrarySchedule((current) => {
      const duplicate = current.some((item) => item.kind === libraryTab && item.value.toLowerCase() === nextValue.toLowerCase());
      if (duplicate) {
        return current;
      }

      return [
        ...current,
        {
          id: `${libraryTab}-${Date.now()}-${current.length}`,
          kind: libraryTab,
          value: nextValue,
        },
      ];
    });

    if (resolved) {
      setLibrarySearchQuery(nextValue);
    }
  };

  const removeLibraryScheduleItem = (id: string) => {
    setLibrarySchedule((current) => current.filter((item) => item.id !== id));
  };

  const addCueToSchedule = (cue: { title: string; slides: { label: string; text: string }[] }) => {
    const title = cue.title.trim() || "Untitled Song";
    setLibrarySchedule((current) => [
      ...current,
      { id: `songs-cue-${Date.now()}-${current.length}`, kind: "songs", value: title, cueSlides: cue.slides },
    ]);
  };

  const openCueFromSchedule = (item: LibraryScheduleItem) => {
    if (item.cueSlides) setActiveCue(item);
  };

  const previewScheduledItem = (item: LibraryScheduleItem) => {
    void toScheduledSlide(item).then(setPreviewSlide);
  };

  const sendScheduledItemLive = (item: LibraryScheduleItem) => {
    void toScheduledSlide(item).then(sendLiveSlide);
  };

  return {
    addLibraryScheduleItem,
    removeLibraryScheduleItem,
    addCueToSchedule,
    openCueFromSchedule,
    previewScheduledItem,
    sendScheduledItemLive,
  };
}
