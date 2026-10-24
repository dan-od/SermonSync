import { type BiblePassage } from "../components/desktop/uiTypes";
import { useConfigStore } from "../stores";
import { type ProjectorSlide, type SuggestionCard } from "../types/state";

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
