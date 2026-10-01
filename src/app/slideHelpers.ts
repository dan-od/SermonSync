import type { BiblePassage } from "../components/desktop/uiTypes";
import { lookupScriptureVerse } from "../lib/sidecarClient";
import { useConfigStore } from "../stores";
import type { ProjectorSlide, SuggestionCard } from "../types/state";
import { passageLibrary } from "./passageLibrary";
import type { LibraryScheduleItem } from "./types";

export function formatReference(slide: { reference: ProjectorSlide["reference"] }) {
  const { reference } = slide;
  return `${reference.book} ${reference.chapter}:${reference.verse}`;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

export function toSlide(card: SuggestionCard | BiblePassage): ProjectorSlide {
  const versions = useConfigStore.getState().bibleVersions;
  const matched = versions.find(
    (v) =>
      v.abbreviation.toLowerCase() === card.version.toLowerCase() ||
      v.name.toLowerCase() === card.version.toLowerCase(),
  );
  return {
    reference: card.reference,
    text: card.text,
    version: matched?.name || card.version,
  };
}

export const toScheduledSlide = async (item: LibraryScheduleItem): Promise<ProjectorSlide> => {
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
