import type { Song, SongSlide } from "../../stores/songStore";
import type { ProjectorMedia, ProjectorSlide } from "../../types/state";

export type LibraryTab = "scriptures" | "songs" | "media" | "overlays" | "templates";

export type LibraryNavigationHandler = (direction: -1 | 1) => void;

/** "words" free-text searches verse content; "reference" only matches an explicit book/chapter/verse lookup, FreeShow-style. */
export type ScriptureSearchMode = "words" | "reference";

export type TemplateFilter = "scriptures" | "songs";

export interface SearchableLibraryTabProps {
  previewReference: string | null;
  liveReference: string | null;
  onPreviewSlide: (slide: ProjectorSlide) => void;
  onSendLive: (slide: ProjectorSlide) => void;
  onSelectedScriptureChange?: (slide: ProjectorSlide | null) => void;
  onSelectedSongChange?: (song: Song | null) => void;
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

export interface LocalLibraryPanelProps {
  previewReference: string | null;
  liveReference: string | null;
  previewMedia?: ProjectorMedia | null;
  liveMedia?: ProjectorMedia | null;
  activeTab: LibraryTab;
  searchQuery: string;
  searchMode: ScriptureSearchMode;
  onActiveTabChange: (tab: LibraryTab) => void;
  onPreviewSlide: (slide: ProjectorSlide) => void;
  onSendLive: (slide: ProjectorSlide) => void;
  onPreviewMedia?: (media: ProjectorMedia) => void;
  onSendMedia?: (media: ProjectorMedia) => void;
  onSelectedScriptureChange?: (slide: ProjectorSlide | null) => void;
  onSelectedSongChange?: (song: Song | null) => void;
  onAddToSchedule?: (slide: ProjectorSlide) => void;
  onCreateCue?: (cue: { title: string; slides: SongSlide[] }) => void;
  onNavigationHandlerChange?: (handler: LibraryNavigationHandler | null) => void;
}
