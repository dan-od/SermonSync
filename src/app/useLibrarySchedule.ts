import { useState, type Dispatch, type SetStateAction } from "react";
import { lookupScriptureVerse } from "../lib/sidecarClient";
import { knownScriptureBooks, matchScriptureReferenceIncremental, resolveScriptureSearch } from "../lib/scriptureSearch";
import { type DropPosition, reorderItems } from "../lib/reorderItems";
import type { LibraryTab, ScriptureSearchMode } from "../components/Library/types";
import { useConfigStore } from "../stores";
import { type Song } from "../stores/songStore";
import { type ProjectorSlide } from "../types/state";
import { type LibraryScheduleItem } from "./types";
import { formatReference, toSlide } from "./helpers";
import { passageLibrary } from "./passageLibrary";

interface UseLibraryScheduleArgs {
  libraryTab: LibraryTab;
  librarySearchQuery: string;
  librarySearchMode: ScriptureSearchMode;
  setLibrarySearchQuery: Dispatch<SetStateAction<string>>;
  selectedScripture: ProjectorSlide | null;
  selectedLibrarySong: Song | null;
  setActiveCue: Dispatch<SetStateAction<LibraryScheduleItem | null>>;
  setPreviewSlide: (slide: ProjectorSlide) => void;
  sendLiveSlide: (slide: ProjectorSlide) => void;
}

export function useLibrarySchedule({
  libraryTab,
  librarySearchQuery,
  librarySearchMode,
  setLibrarySearchQuery,
  selectedScripture,
  selectedLibrarySong,
  setActiveCue,
  setPreviewSlide,
  sendLiveSlide,
}: UseLibraryScheduleArgs) {
  const [librarySchedule, setLibrarySchedule] = useState<LibraryScheduleItem[]>([]);

  const addLibraryScheduleItem = (slide?: ProjectorSlide) => {
    const selectedSlide = slide ?? (libraryTab === "scriptures" ? selectedScripture ?? undefined : undefined);
    if (selectedSlide) {
      const kind = selectedSlide.version === "Lyrics" || selectedSlide.version === "SONG" ? "songs" : "scriptures";
      const value = kind === "scriptures" ? `${selectedSlide.reference.book} ${selectedSlide.reference.chapter}:${selectedSlide.reference.verse}` : selectedSlide.text;
      setLibrarySchedule((current) => current.some((item) => item.kind === kind && item.value.toLowerCase() === value.toLowerCase())
        ? current
        : [...current, { id: `${kind}-${Date.now()}-${current.length}`, kind, value, slide: selectedSlide }]);
      return;
    }
    if (libraryTab === "songs") {
      const song = selectedLibrarySong;
      if (!song?.slides.length) return;
      setLibrarySchedule((current) => current.some((item) => item.sourceSongId === song.id)
        ? current
        : [...current, {
            id: `song-${song.id}`,
            kind: "songs",
            value: song.title,
            sourceSongId: song.id,
            cueSlides: song.slides.map(({ label, text }) => ({ label, text })),
          }]);
      return;
    }
    const normalized = librarySearchQuery.trim();
    if (!normalized || libraryTab !== "scriptures") {
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
      if (!resolved) return;
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

  const reorderLibrarySchedule = (sourceId: string, targetId: string, position: DropPosition) => {
    setLibrarySchedule((current) => reorderItems(current, sourceId, targetId, position));
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

  const toScheduledSlide = async (item: LibraryScheduleItem): Promise<ProjectorSlide> => {
    if (item.slide) return item.slide;
    if (item.kind === "scriptures") {
      const exactPassage = passageLibrary.find((passage) => formatReference(passage).toLowerCase() === item.value.toLowerCase());
      if (exactPassage) {
        return toSlide(exactPassage);
      }

      const referenceMatch = item.value.match(/^(.+)\s+(\d+):(\d+)$/);
      if (referenceMatch) {
        const [, book, chapterText, verseText] = referenceMatch;
        const chapter = Number.parseInt(chapterText, 10);
        const verse = Number.parseInt(verseText, 10);
        const configVersion = useConfigStore.getState().bibleVersion;
        const versions = useConfigStore.getState().bibleVersions;
        const matched = versions.find(
          (v) =>
            v.abbreviation.toLowerCase() === configVersion.toLowerCase() ||
            v.name.toLowerCase() === configVersion.toLowerCase(),
        );
        const lookupVersion = matched?.abbreviation || configVersion;
        const defaultDisplayName = matched?.name || matched?.abbreviation || configVersion;
        const looked = await lookupScriptureVerse(book.trim(), chapter, verse, lookupVersion);
        return {
          reference: { book: book.trim(), chapter, verse },
          text: looked?.text ?? item.value,
          version: looked?.version ?? defaultDisplayName,
        };
      }
    }

    const configVersion = useConfigStore.getState().bibleVersion;
    const versions = useConfigStore.getState().bibleVersions;
    const matched = versions.find(
      (v) =>
        v.abbreviation.toLowerCase() === configVersion.toLowerCase() ||
        v.name.toLowerCase() === configVersion.toLowerCase(),
    );
    const defaultDisplayName = matched?.name || matched?.abbreviation || configVersion;

    return {
      reference: {
        book: item.kind === "songs" ? "Song" : "Scheduled",
        chapter: 1,
        verse: 1,
      },
      text: item.value,
      version: item.kind === "songs" ? "SONG" : defaultDisplayName,
    };
  };

  const previewScheduledItem = (item: LibraryScheduleItem) => {
    void toScheduledSlide(item).then(setPreviewSlide);
  };

  const sendScheduledItemLive = (item: LibraryScheduleItem) => {
    void toScheduledSlide(item).then(sendLiveSlide);
  };

  return {
    librarySchedule,
    addLibraryScheduleItem,
    removeLibraryScheduleItem,
    reorderLibrarySchedule,
    addCueToSchedule,
    openCueFromSchedule,
    previewScheduledItem,
    sendScheduledItemLive,
  };
}
