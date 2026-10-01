import type { Song, SongSlide } from "../../stores/songStore";
import type { ProjectorSlide } from "../../types/state";

// ─── Types ────────────────────────────────────────────────────────────────────

export type LibraryTab = "scriptures" | "songs" | "media" | "templates";
export type LibraryNavigationHandler = (direction: -1 | 1) => void;
/** "words" free-text searches verse content; "reference" only matches an explicit book/chapter/verse lookup, FreeShow-style. */
export type ScriptureSearchMode = "words" | "reference";
export type TemplateFilter = "scriptures" | "songs";

export interface SearchableLibraryTabProps {
  previewReference: string | null;
  liveReference: string | null;
  onPreviewSlide: (slide: ProjectorSlide) => void;
  onSendLive: (slide: ProjectorSlide) => void;
  onAddToSchedule?: (slide: ProjectorSlide) => void;
  onCreateCue?: (cue: { title: string; slides: SongSlide[] }) => void;
  searchQuery: string;
  onNavigationHandlerChange?: (handler: LibraryNavigationHandler | null) => void;
}

export interface LocalBibleEntry {
  id: string;
  name: string;
  abbreviation: string;
  available: boolean;
}

export interface BibleVersionEntry {
  abbreviation: string;
  name: string;
  verse_count: number;
  available: boolean;
}

export interface BibleBook {
  name: string;
  abbreviation: string;
  testament: string;
  position: number;
}

export interface BibleVerse {
  verse: number;
  text: string;
}

export interface BibleChapter {
  number: number;
  verses: BibleVerse[];
}

export interface BibleBookPayload {
  version: string;
  book: BibleBook;
  chapters: BibleChapter[];
}

export interface BibleImportResult {
  version: BibleVersionEntry;
  books: BibleBook[];
}

export interface SongContextMenuState {
  song: Song;
  x: number;
  y: number;
}
