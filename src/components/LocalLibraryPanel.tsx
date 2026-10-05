import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { matchScriptureReferenceIncremental } from "../lib/scriptureSearch";
import { contextMenuPosition } from "../lib/contextMenuPosition";
import { setActiveBibleVersion } from "../lib/sidecarClient";
import { filtersToCss, flipTransform } from "../lib/mediaFilters";
import { MEDIA_CATEGORIES, mediaCategoryForPath } from "../lib/mediaLibrary";
import { importErrorMessage, importVideo, isManagedVideo, managedVideoPosterUrl, managedVideoUrl, type VideoAsset, type VideoImportProgress } from "../lib/videoImport";
import { warmPreparedVideo } from "../lib/templateVideoWarmup";
import { useAudioPeaks } from "../lib/waveform";
import { useConfigStore } from "../stores/configStore";
import { useTemplateStore } from "../stores/templateStore";
import { useSongStore, type Song, type SongSlide } from "../stores/songStore";
import type { ProjectorMedia, ProjectorSlide } from "../types/state";
import {
  DEFAULT_AUDIO_SETTINGS,
  DEFAULT_IMAGE_SETTINGS,
  DEFAULT_VIDEO_SETTINGS,
  type AudioMediaSettings,
  type ImageMediaSettings,
  type MediaCategory,
  type MediaItem,
  type VideoMediaSettings,
} from "../types/media";
import { TemplateSceneOverlay } from "./ProjectorView";
import { projectionScene } from "../lib/projectionScene";
import { TemplateEditorModal } from "./Templates/TemplateEditorModal";
import { NewSongModal } from "./Songs/NewSongModal";
import { SongStudioModal } from "./Songs/SongStudioModal";
import { AudioStudioModal } from "./Media/AudioStudioModal";
import { ImageStudioModal } from "./Media/ImageStudioModal";
import { ResilientImage } from "./ResilientImage";
import { VideoStudioModal } from "./Media/VideoStudioModal";
import { WaveformCanvas } from "./Media/Waveform";
import { OverlaysTab } from "./Overlays/OverlaysTab";

// ─── Types ────────────────────────────────────────────────────────────────────

export type LibraryTab = "scriptures" | "songs" | "media" | "overlays" | "templates";
export type LibraryNavigationHandler = (direction: -1 | 1) => void;
/** "words" free-text searches verse content; "reference" only matches an explicit book/chapter/verse lookup, FreeShow-style. */
export type ScriptureSearchMode = "words" | "reference";
type TemplateFilter = "scriptures" | "songs";

interface SearchableLibraryTabProps {
  isActive?: boolean;
  previewReference: string | null;
  liveReference: string | null;
  onPreviewSlide: (slide: ProjectorSlide) => void;
  onSendLive: (slide: ProjectorSlide) => void;
  onSelectedScriptureChange?: (slide: ProjectorSlide | null) => void;
  onCreateCue?: (cue: { title: string; slides: SongSlide[] }) => void;
  searchQuery: string;
  onNavigationHandlerChange?: (handler: LibraryNavigationHandler | null) => void;
}

interface LocalBibleEntry {
  id: string;
  name: string;
  abbreviation: string;
  available: boolean;
}

interface BibleVersionEntry {
  abbreviation: string;
  name: string;
  verse_count: number;
  available: boolean;
}

interface BibleBook {
  name: string;
  abbreviation: string;
  testament: string;
  position: number;
}

interface BibleVerse {
  verse: number;
  text: string;
}

interface BibleChapter {
  number: number;
  verses: BibleVerse[];
}

interface BibleBookPayload {
  version: string;
  book: BibleBook;
  chapters: BibleChapter[];
}

interface BibleImportResult {
  version: BibleVersionEntry;
  books: BibleBook[];
}

interface LocalLibraryPanelProps {
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
  onSelectedScriptureChange?: (slide: ProjectorSlide | null) => void;
  onCreateCue?: (cue: { title: string; slides: SongSlide[] }) => void;
  onNavigationHandlerChange?: (handler: LibraryNavigationHandler | null) => void;
  onPreviewMedia: (media: ProjectorMedia) => void;
  onSendMedia: (media: ProjectorMedia) => void;
}

const BIBLE_API_BASE = "http://127.0.0.1:8000";

// ─── Small shared primitives ──────────────────────────────────────────────────

function tableHeaderCellStyle(isFirst?: boolean): React.CSSProperties {
  return {
    padding: "6px 12px",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--text-xs)",
    fontWeight: 600,
    letterSpacing: "0.08em",
    color: "var(--fg-muted)",
    whiteSpace: "nowrap",
    background: "var(--bg-elevated)",
    borderBottom: "1px solid var(--border-base)",
    borderRight: isFirst ? "1px solid var(--border-base)" : undefined,
    userSelect: "none",
  };
}


// ─── Scriptures tab ───────────────────────────────────────────────────────────

function referenceLabel(slide: ProjectorSlide) {
  return `${slide.reference.book} ${slide.reference.chapter}:${slide.reference.verse}`;
}

function toProjectorSlide(book: string, chapter: number, verse: BibleVerse, version: string): ProjectorSlide {
  return {
    reference: { book, chapter, verse: verse.verse },
    text: verse.text,
    version,
  };
}

async function fetchBibleJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${BIBLE_API_BASE}${path}`, { signal });
  if (!response.ok) {
    let detail = `Bible API error (${response.status})`;
    try {
      const body = await response.json() as { detail?: unknown };
      if (typeof body.detail === "string" && body.detail) {
        detail = body.detail;
      }
    } catch {
      // body is not JSON — keep the status-code message
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

function ScripturePane({
  title,
  children,
  width,
  showDivider = true,
  action,
}: {
  title: string;
  children: React.ReactNode;
  width?: string;
  showDivider?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <section
      style={{
        minWidth: 0,
        width,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRight: showDivider ? "1px solid var(--border-base)" : "none",
        background: "var(--bg-base)",
      }}
    >
      <div style={{ ...tableHeaderCellStyle(), display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>{title}</span>
        {action}
      </div>
      <div className="scripture-scroll-pane" style={{ flex: 1, minHeight: 0 }}>
        {children}
      </div>
    </section>
  );
}

function ScriptureCellButton({
  children,
  isActive,
  isPreview,
  isLive,
  isDisabled,
  onClick,
  onDoubleClick,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
  title,
  align = "left",
  hovered = false,
  trackHover = true,
  songId,
}: {
  children: React.ReactNode;
  isActive?: boolean;
  isPreview?: boolean;
  isLive?: boolean;
  isDisabled?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  title?: string;
  align?: "left" | "center";
  hovered?: boolean;
  trackHover?: boolean;
  songId?: string;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const activeColor = isLive ? "var(--color-success)" : isPreview ? "var(--color-primary)" : "var(--color-primary)";
  const isHighlighted = isActive || isPreview || isLive;
  const isRowHovered = hovered || (trackHover && isHovered);

  return (
    <button
      type="button"
      data-song-id={songId}
      disabled={isDisabled}
      title={title}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => {
        setIsHovered(true);
        onMouseEnter?.();
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        onMouseLeave?.();
      }}
      style={{
        display: "block",
        width: "100%",
        boxSizing: "border-box",
        minHeight: 30,
        padding: "6px 12px",
        background: isHighlighted || isRowHovered ? "var(--color-primary-muted)" : "transparent",
        border: "none",
        borderLeft: isActive || isPreview || isLive ? `2px solid ${activeColor}` : "2px solid transparent",
        color: isDisabled ? "var(--fg-subtle)" : isHighlighted ? activeColor : "var(--fg-base)",
        cursor: isDisabled ? "not-allowed" : "pointer",
        fontSize: "var(--text-xs)",
        fontWeight: isActive || isPreview || isLive ? 600 : 400,
        opacity: isDisabled ? 0.55 : 1,
        outline: "none",
        overflow: "hidden",
        textAlign: align,
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function PaneEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "14px 12px",
        color: "var(--fg-subtle)",
        fontSize: "var(--text-xs)",
        fontStyle: "italic",
      }}
    >
      {children}
    </div>
  );
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

function ScripturesTab({
  isActive = true,
  previewReference,
  liveReference,
  onPreviewSlide,
  onSendLive,
  onSelectedScriptureChange,
  searchQuery,
  searchMode,
  onNavigationHandlerChange,
}: SearchableLibraryTabProps & { searchMode: ScriptureSearchMode }) {
  const [localOpen, setLocalOpen] = useState(true);
  const [apiOpen, setApiOpen] = useState(false);
  const defaultBibleVersion = useConfigStore((state) => state.bibleVersion);
  const configuredVersions = useConfigStore((state) => state.bibleVersions);
  const setDefaultBibleVersion = useConfigStore((state) => state.setBibleVersion);
  const setBibleVersions = useConfigStore((state) => state.setBibleVersions);
  const [versions, setVersions] = useState<BibleVersionEntry[]>([]);
  const [books, setBooks] = useState<BibleBook[]>([]);
  const [bookPayload, setBookPayload] = useState<BibleBookPayload | null>(null);
  const [selectedBibleId, setSelectedBibleId] = useState<string | null>(null);
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  const [selectedVerse, setSelectedVerse] = useState<number | null>(null);
  const [selectedReference, setSelectedReference] = useState<string | null>(null);
  const [scriptureClickAction, setScriptureClickAction] = useState<"preview" | "live">("live");
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  // Chapter/verse a reference search resolved to, applied once the matching book's
  // payload finishes loading — otherwise loadBook's "default to chapter 1" reset wins the race.
  const pendingReferenceRef = useRef<{ book: string; chapter: number; verse: number | null } | null>(null);
  const verseRowRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      // Always mirror the store, including when it goes empty (e.g. the last
      // version was just deleted) — otherwise a deleted version lingers here
      // until the panel remounts.
      setVersions(configuredVersions);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [configuredVersions]);

  const localBibles = useMemo(
    () =>
      versions
        .filter((version) => version.available)
        .map((version) => ({
          id: version.abbreviation.toLowerCase(),
          name: version.name,
          abbreviation: version.abbreviation,
          available: version.available,
        })),
    [versions],
  );

  const selectedBible = useMemo(
    () => localBibles.find((bible) => bible.id === selectedBibleId) ?? localBibles.find((bible) => bible.available) ?? localBibles[0],
    [localBibles, selectedBibleId],
  );
  const selectedVersion = selectedBible?.abbreviation ?? defaultBibleVersion;
  const selectedDisplayName = selectedBible?.name || selectedBible?.abbreviation || defaultBibleVersion;
  const activeBookPayload = selectedBook && selectedBible?.available ? bookPayload : null;
  const selectedChapterData = activeBookPayload?.chapters.find((chapter) => chapter.number === selectedChapter) ?? null;
  const selectedVerseData = selectedChapterData?.verses.find((verse) => verse.verse === selectedVerse) ?? null;
  const resolvedSearchReference = useMemo(
    () => (searchMode === "reference" ? matchScriptureReferenceIncremental(searchQuery, books.map((entry) => entry.name)) : null),
    [searchMode, searchQuery, books],
  );
  const textSearchQuery = searchMode === "words" ? normalizeSearch(searchQuery) : "";

  const [wholeBibleResults, setWholeBibleResults] = useState<{ book: string; chapter: number; verse: BibleVerse }[]>([]);
  const [isSearchingWholeBible, setIsSearchingWholeBible] = useState(false);

  // Distinct books/chapters that actually contain a hit, so the Book and Chapter
  // panes behave as narrowing filters over the search results instead of the
  // full catalog. A book or chapter can (and often will) reappear here once per
  // matching verse it contains — that's expected, every hit still surfaces.
  const searchedBookNames = useMemo(() => new Set(wholeBibleResults.map((row) => row.book)), [wholeBibleResults]);
  const searchedChapterNumbers = useMemo(() => {
    if (!selectedBook) {
      return [];
    }
    const numbers = new Set(wholeBibleResults.filter((row) => row.book === selectedBook).map((row) => row.chapter));
    return Array.from(numbers).sort((a, b) => a - b);
  }, [selectedBook, wholeBibleResults]);

  const filteredBooks = useMemo(() => {
    if (textSearchQuery) {
      // Below the sidecar's 2-char search threshold there's no result set yet — show
      // the full catalog rather than an empty list until a real search has run.
      if (searchQuery.trim().length < 2) {
        return books;
      }
      return books.filter((entry) => searchedBookNames.has(entry.name));
    }

    if (!resolvedSearchReference || !searchQuery.trim()) {
      return books;
    }

    return books.filter((entry) => resolvedSearchReference.candidateBooks.includes(entry.name));
  }, [books, resolvedSearchReference, searchQuery, searchedBookNames, textSearchQuery]);
  const filteredChapterNumbers = useMemo(() => {
    if (textSearchQuery) {
      return searchedChapterNumbers;
    }

    if (!activeBookPayload) {
      return [];
    }

    if (resolvedSearchReference?.chapter != null) {
      return activeBookPayload.chapters
        .filter((chapter) => chapter.number === resolvedSearchReference.chapter)
        .map((chapter) => chapter.number);
    }

    return activeBookPayload.chapters.map((chapter) => chapter.number);
  }, [activeBookPayload, resolvedSearchReference, searchedChapterNumbers, textSearchQuery]);
  const [wholeBibleSearchError, setWholeBibleSearchError] = useState<string | null>(null);

  // Free-text queries search every book via the sidecar's FTS5 index, not just
  // whichever book happens to be selected in the Book pane.
  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    const shouldSearch = Boolean(textSearchQuery) && trimmedQuery.length >= 2 && Boolean(selectedBible?.available);
    const abortController = new AbortController();
    let timeoutId: number | null = null;
    let cancelled = false;

    if (!shouldSearch) {
      queueMicrotask(() => {
        if (cancelled) {
          return;
        }
        setWholeBibleResults([]);
        setWholeBibleSearchError(null);
        setIsSearchingWholeBible(false);
      });
    } else {
      timeoutId = window.setTimeout(() => {
        if (cancelled) {
          return;
        }

        setIsSearchingWholeBible(true);
        setWholeBibleSearchError(null);

        fetchBibleJson<{ results: { book: string; chapter: number; verse: number; text: string }[] }>(
          `/api/bible/search?q=${encodeURIComponent(trimmedQuery)}&version=${encodeURIComponent(selectedVersion)}&limit=40`,
          abortController.signal,
        )
          .then((payload) => {
            if (cancelled) return;
            setWholeBibleResults(
              payload.results.map((entry) => ({
                book: entry.book,
                chapter: entry.chapter,
                verse: { verse: entry.verse, text: entry.text },
              })),
            );
          })
          .catch((error: unknown) => {
            if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
            setWholeBibleResults([]);
            setWholeBibleSearchError(error instanceof Error ? error.message : "Bible search failed");
          })
          .finally(() => {
            if (!cancelled) setIsSearchingWholeBible(false);
          });
      }, 180);
    }

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      abortController.abort();
    };
  }, [textSearchQuery, searchQuery, selectedVersion, selectedBible?.available]);

  const displayedVerseRows = useMemo(() => {
    if (textSearchQuery) {
      return wholeBibleResults.filter(
        (row) => (!selectedBook || row.book === selectedBook) && (selectedChapter === null || row.chapter === selectedChapter),
      );
    }

    if (!activeBookPayload) {
      return [];
    }

    const bookName = activeBookPayload.book.name;
    const verses = selectedVerseData ? [selectedVerseData] : selectedChapterData?.verses ?? [];
    return verses.map((verse) => ({ book: bookName, chapter: selectedChapter ?? selectedChapterData?.number ?? 1, verse }));
  }, [
    activeBookPayload,
    selectedBook,
    selectedChapter,
    selectedChapterData?.number,
    selectedChapterData?.verses,
    selectedVerseData,
    textSearchQuery,
    wholeBibleResults,
  ]);

  // Scroll the resolved verse into view once its row exists, e.g. after a reference search.
  useEffect(() => {
    if (selectedVerse == null) {
      return;
    }
    const row = verseRowRefs.current.get(selectedVerse);
    row?.scrollIntoView({ block: "center" });
  }, [selectedVerse, displayedVerseRows]);

  const loadCatalog = useCallback(
    async (preferredVersion?: string) => {
      setIsLoading(true);
      setLoadError(null);

      try {
        const versionData = await fetchBibleJson<{ versions: BibleVersionEntry[] }>("/api/bible/versions");
        const availableVersionData = versionData.versions.filter((version) => version.abbreviation.toUpperCase() !== "KJV");
        setVersions(availableVersionData);
        setBibleVersions(availableVersionData);

        const requestedVersion = preferredVersion?.trim().toLowerCase();
        const availableDefault =
          availableVersionData.find((version) => version.abbreviation.toLowerCase() === requestedVersion && version.available) ??
          availableVersionData.find((version) => version.abbreviation.toLowerCase() === defaultBibleVersion.toLowerCase() && version.available) ??
          availableVersionData.find((version) => version.available);

        const nextVersion = availableDefault?.abbreviation ?? null;
        if (!nextVersion) {
          setSelectedBibleId(null);
          setBooks([]);
          setBookPayload(null);
          setSelectedBook(null);
          setSelectedChapter(null);
          setSelectedVerse(null);
          setLoadError("No imported Bibles are available yet.");
          return;
        }

        setSelectedBibleId(nextVersion.toLowerCase());
        setDefaultBibleVersion(nextVersion);
        const bookData = await fetchBibleJson<{ books: BibleBook[] }>(`/api/bible/books?version=${encodeURIComponent(nextVersion)}`);
        setBooks(bookData.books);
        setSelectedBook(null);
        setSelectedChapter(null);
        setSelectedVerse(null);
        setBookPayload(null);
      } catch (err) {
        setVersions([]);
        setSelectedBibleId(null);
        setBooks([]);
        setBookPayload(null);
        setSelectedBook(null);
        setSelectedChapter(null);
        setSelectedVerse(null);
        const msg = err instanceof Error ? err.message : String(err);
        const isUnreachable =
          msg.includes("Failed to fetch") ||
          msg.includes("NetworkError") ||
          msg.toLowerCase().includes("fetch");
        setLoadError(
          isUnreachable
            ? "Python sidecar unreachable \u2014 run: cd python-sidecar && python main.py"
            : `Bible API error: ${msg}`,
        );
      } finally {
        setIsLoading(false);
      }
    },
    [defaultBibleVersion, setBibleVersions, setDefaultBibleVersion],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadCatalog();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadCatalog]);

  useEffect(() => {
    if (searchMode !== "reference" || !resolvedSearchReference?.matchedBook) {
      return;
    }

    const targetBook = resolvedSearchReference.matchedBook;
    const targetChapter = resolvedSearchReference.chapter;
    const targetVerse = resolvedSearchReference.verse;

    const timeoutId = window.setTimeout(() => {
      if (selectedBook !== targetBook) {
        // New book: its payload isn't loaded yet, so queue the chapter/verse for
        // loadBook to apply once fetched instead of racing it here.
        pendingReferenceRef.current = targetChapter != null ? { book: targetBook, chapter: targetChapter, verse: targetVerse } : null;
        setSelectedBook(targetBook);
        return;
      }

      // Same book already selected and its payload is already loaded — apply directly.
      if (targetChapter != null && targetChapter !== selectedChapter) {
        setSelectedChapter(targetChapter);
      }
      if (targetVerse !== selectedVerse) {
        const chapterData = bookPayload?.chapters.find((chapter) => chapter.number === (targetChapter ?? selectedChapter));
        const verseExists = targetVerse != null && chapterData?.verses.some((verse) => verse.verse === targetVerse);
        setSelectedVerse(verseExists ? targetVerse : null);
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [bookPayload, resolvedSearchReference, searchMode, selectedBook, selectedChapter, selectedVerse]);

  useEffect(() => {
    if (!selectedBible?.available || !selectedVersion) {
      return;
    }
    void setActiveBibleVersion(selectedVersion).catch(() => undefined);
  }, [selectedBible?.available, selectedVersion]);

  useEffect(() => {
    if (!selectedBook || !selectedBible?.available) {
      return;
    }

    const bookName = selectedBook;

    async function loadBook() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const payload = await fetchBibleJson<BibleBookPayload>(
          `/api/bible/book?version=${encodeURIComponent(selectedVersion)}&book=${encodeURIComponent(bookName)}`,
        );

        setBookPayload(payload);

        const pending = pendingReferenceRef.current;
        if (pending && pending.book === bookName) {
          pendingReferenceRef.current = null;
          const matchedChapter = payload.chapters.find((chapter) => chapter.number === pending.chapter);
          const verseExists = pending.verse != null && matchedChapter?.verses.some((verse) => verse.verse === pending.verse);
          setSelectedChapter(matchedChapter?.number ?? payload.chapters[0]?.number ?? null);
          setSelectedVerse(verseExists ? pending.verse : null);
        } else {
          pendingReferenceRef.current = null;
          setSelectedChapter(payload.chapters[0]?.number ?? null);
          setSelectedVerse(null);
        }
      } catch {
        pendingReferenceRef.current = null;
        setBookPayload(null);
        setSelectedChapter(null);
        setSelectedVerse(null);
        setLoadError("Could not load the full Bible book.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadBook();
  }, [selectedBible?.available, selectedBook, selectedVersion]);

  const selectBible = (bible: LocalBibleEntry) => {
    if (!bible.available) {
      return;
    }

    setSelectedBibleId(bible.id);
    setDefaultBibleVersion(bible.abbreviation);
    setSelectedBook(null);
    setSelectedChapter(null);
    setSelectedVerse(null);
    setBookPayload(null);
    onSelectedScriptureChange?.(null);

    fetchBibleJson<{ books: BibleBook[] }>(`/api/bible/books?version=${encodeURIComponent(bible.abbreviation)}`)
      .then((payload) => {
        setBooks(payload.books);
        setSelectedBook(null);
      })
      .catch(() => {
        setBooks([]);
        setSelectedBook(null);
        setLoadError("Could not load Bible metadata.");
      });
  };

  const importBibleFile = useCallback(
    async () => {
      setIsImporting(true);
      setImportError(null);

      try {
        if (!isTauriRuntime()) {
          throw new Error("Open SermonSync in Tauri to import local XML files.");
        }

        const selected = await open({
          multiple: false,
          filters: [{ name: "Bible XML", extensions: ["xml"] }],
        });

        if (!selected) {
          return;
        }

        const path = Array.isArray(selected) ? selected[0] : selected;
        if (!path) {
          return;
        }

        const result = await invoke<BibleImportResult>("import_bible_file", { path });
        await loadCatalog(result.version.abbreviation);
        setAddModalOpen(false);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "Bible import failed.";
        setImportError(message);
      } finally {
        setIsImporting(false);
      }
    },
    [loadCatalog],
  );

  const handleTextClick = (book: string, chapter: number, verse: BibleVerse) => {
    const slide = toProjectorSlide(book, chapter, verse, selectedDisplayName);
    setSelectedReference(referenceLabel(slide));
    onSelectedScriptureChange?.(slide);
    if (scriptureClickAction === "preview") {
      onPreviewSlide(slide);
    } else {
      onSendLive(slide);
    }
  };

  const handleTextDoubleClick = (book: string, chapter: number, verse: BibleVerse) => {
    if (scriptureClickAction === "live") {
      return;
    }
    const slide = toProjectorSlide(book, chapter, verse, selectedDisplayName);
    setSelectedReference(referenceLabel(slide));
    onSelectedScriptureChange?.(slide);
    onSendLive(slide);
  };

  const handleTextKeyDown = (event: React.KeyboardEvent, book: string, chapter: number, verse: BibleVerse) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    const slide = toProjectorSlide(book, chapter, verse, selectedDisplayName);
    setSelectedReference(referenceLabel(slide));
    onSelectedScriptureChange?.(slide);
    if (scriptureClickAction === "preview") {
      onPreviewSlide(slide);
    } else {
      onSendLive(slide);
    }
  };

  const navigateVerses = useCallback(
    (direction: -1 | 1) => {
      const verses = selectedChapterData?.verses ?? [];
      if (!activeBookPayload || !selectedChapter || verses.length === 0) return;

      const currentIndex = verses.findIndex(
        (verse) => referenceLabel(toProjectorSlide(activeBookPayload.book.name, selectedChapter, verse, selectedDisplayName)) === liveReference,
      );
      const nextIndex = (currentIndex + direction + verses.length) % verses.length;
      const nextVerse = verses[nextIndex];
      const nextSlide = toProjectorSlide(activeBookPayload.book.name, selectedChapter, nextVerse, selectedDisplayName);
      onPreviewSlide(nextSlide);
      onSendLive(nextSlide);
    },
    [activeBookPayload, liveReference, onPreviewSlide, onSendLive, selectedChapter, selectedChapterData?.verses, selectedDisplayName],
  );

  useEffect(() => {
    if (!isActive) return;
    onNavigationHandlerChange?.(navigateVerses);
    return () => onNavigationHandlerChange?.(null);
  }, [isActive, navigateVerses, onNavigationHandlerChange]);

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Left sidebar */}
      <div
        style={{
          width: 188,
          flexShrink: 0,
          borderRight: "1px solid var(--border-base)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div className="scripture-scroll-pane" style={{ flex: 1, minHeight: 0 }}>
          {/* Local Bibles accordion */}
          <AccordionGroup
            label="Local Bibles"
            isOpen={localOpen}
            onToggle={() => setLocalOpen((v) => !v)}
          >
            {localBibles.map((bible) => (
              <BibleItem
                key={bible.id}
                bible={bible}
                isSelected={selectedBibleId === bible.id}
                onSelect={() => selectBible(bible)}
              />
            ))}
            {localBibles.length === 0 && (
              <div
                style={{
                  padding: "6px 12px 6px 24px",
                  fontSize: "var(--text-xs)",
                  color: "var(--fg-subtle)",
                  fontStyle: "italic",
                }}
              >
                Import a Bible file to populate this library
              </div>
            )}
          </AccordionGroup>

          {/* API Bibles accordion */}
          <AccordionGroup
            label="API Bibles"
            isOpen={apiOpen}
            onToggle={() => setApiOpen((v) => !v)}
            showDivider={false}
          >
            <div
              style={{
                padding: "6px 12px 6px 24px",
                fontSize: "var(--text-xs)",
                color: "var(--fg-subtle)",
                fontStyle: "italic",
              }}
            >
              No API bibles connected
            </div>
          </AccordionGroup>
        </div>

        {/* Add button pinned to bottom */}
        <div
          style={{
            padding: "var(--space-2)",
          }}
        >
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            title="Import Bible file"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              borderRadius: "var(--radius-sm)",
              background: "var(--color-primary-muted)",
              border: "none",
              color: "var(--color-primary)",
              fontSize: "var(--text-base)",
              lineHeight: 1,
              cursor: "pointer",
              transition: "background 120ms ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--color-primary)";
              (e.currentTarget as HTMLButtonElement).style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--color-primary-muted)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--color-primary)";
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* Main browser */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          height: "100%",
          display: "grid",
          gridTemplateColumns: "108px 76px minmax(220px, 2.2fr)",
          gridTemplateRows: "100%",
          overflow: "hidden",
          borderRight: "1px solid var(--border-base)",
        }}
      >
        <ScripturePane title="Book">
          {filteredBooks.map((entry) => (
            <ScriptureCellButton
              key={entry.name}
              isActive={selectedBook === entry.name}
              onClick={() => {
                setSelectedBook(entry.name);
                setSelectedChapter(null);
                setSelectedVerse(null);
                onSelectedScriptureChange?.(null);
              }}
            >
              {entry.name}
            </ScriptureCellButton>
          ))}
          {books.length === 0 && <PaneEmpty>No books available</PaneEmpty>}
          {books.length > 0 && filteredBooks.length === 0 && <PaneEmpty>No matching books</PaneEmpty>}
        </ScripturePane>

        <ScripturePane title="Chapter">
          {filteredChapterNumbers.map((chapterNumber) => (
            <ScriptureCellButton
              key={chapterNumber}
              align="center"
              isActive={selectedChapter === chapterNumber}
              onClick={() => {
                setSelectedChapter(chapterNumber);
                setSelectedVerse(null);
                onSelectedScriptureChange?.(null);
              }}
            >
              {chapterNumber}
            </ScriptureCellButton>
          ))}
          {textSearchQuery ? (
            <>
              {!selectedBook && <PaneEmpty>Select a book to narrow results</PaneEmpty>}
              {selectedBook && filteredChapterNumbers.length === 0 && <PaneEmpty>No matches in this book</PaneEmpty>}
            </>
          ) : (
            <>
              {!activeBookPayload && <PaneEmpty>{selectedBible?.available === false ? "Unavailable" : "Select a book"}</PaneEmpty>}
              {activeBookPayload && filteredChapterNumbers.length === 0 && <PaneEmpty>No matching chapter</PaneEmpty>}
            </>
          )}
        </ScripturePane>

        <ScripturePane
          title={textSearchQuery ? "Search Results" : "Verse"}
          action={
            <div role="group" aria-label="Scripture click action" style={{ display: "flex", overflow: "hidden", borderRadius: "var(--radius-sm)" }}>
              <button
                type="button"
                aria-pressed={scriptureClickAction === "preview"}
                onClick={() => setScriptureClickAction("preview")}
                style={slideActionButtonStyle(scriptureClickAction === "preview")}
              >
                Preview First
              </button>
              <button
                type="button"
                aria-pressed={scriptureClickAction === "live"}
                onClick={() => setScriptureClickAction("live")}
                style={slideActionButtonStyle(scriptureClickAction === "live")}
              >
                Live
              </button>
            </div>
          }
        >
          {displayedVerseRows.map(({ book, chapter, verse }) => {
            const slide = toProjectorSlide(book, chapter, verse, selectedDisplayName);
            const label = referenceLabel(slide);

            return (
              <div key={`${book}-${chapter}-${verse.verse}`}>
              <button
                type="button"
                ref={(el) => {
                  if (el) {
                    verseRowRefs.current.set(verse.verse, el);
                  } else {
                    verseRowRefs.current.delete(verse.verse);
                  }
                }}
                onClick={() => handleTextClick(book, chapter, verse)}
                onDoubleClick={() => handleTextDoubleClick(book, chapter, verse)}
                onFocus={() => { setSelectedReference(label); onSelectedScriptureChange?.(slide); }}
                onKeyDown={(event) => handleTextKeyDown(event, book, chapter, verse)}
                style={{
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: textSearchQuery ? "96px minmax(0, 1fr)" : "56px minmax(0, 1fr)",
                  gap: "var(--space-2)",
                  padding: "8px 12px",
                  background: selectedReference === label || (selectedReference === null && (liveReference === label || previewReference === label))
                    ? "var(--color-primary-muted)"
                    : "transparent",
                  border: "none",
                  borderLeft:
                    selectedReference === label
                      ? "2px solid var(--color-primary)"
                      : selectedReference === null && liveReference === label
                      ? "2px solid var(--color-success)"
                      : selectedReference === null && previewReference === label
                        ? "2px solid var(--color-primary)"
                        : "2px solid transparent",
                  color: "var(--fg-base)",
                  cursor: "pointer",
                  outline: "none",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                    minWidth: 0,
                    color: selectedReference === label
                      ? "var(--color-primary)"
                      : selectedReference === null && liveReference === label
                        ? "var(--color-success)"
                        : "var(--color-primary)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-xs)",
                    fontWeight: 700,
                  }}
                >
                  {textSearchQuery ? (
                    <>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{book}</span>
                      <span>{chapter}:{verse.verse}</span>
                    </>
                  ) : (
                    <span>{chapter}:{verse.verse}</span>
                  )}
                </span>
                <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)", lineHeight: 1.45 }}>
                  {verse.text}
                </span>
              </button>
              </div>
            );
          })}
          {textSearchQuery && isSearchingWholeBible && <PaneEmpty>Searching the whole Bible...</PaneEmpty>}
          {textSearchQuery && !isSearchingWholeBible && wholeBibleSearchError && <PaneEmpty>{wholeBibleSearchError}</PaneEmpty>}
          {displayedVerseRows.length === 0 && !(textSearchQuery && (isSearchingWholeBible || wholeBibleSearchError)) && (
            <PaneEmpty>
              {isLoading
                ? "Loading scriptures..."
                : textSearchQuery
                  ? "No matching verses in the whole Bible"
                  : selectedBible?.available === false
                    ? "This Bible has no local text yet"
                    : "Select a verse"}
            </PaneEmpty>
          )}
          {loadError && <PaneEmpty>{loadError}</PaneEmpty>}
        </ScripturePane>
      </div>

      {/* Add scripture modal */}
      {addModalOpen && (
        <AddScriptureModal
          onClose={() => setAddModalOpen(false)}
          onImportBible={importBibleFile}
          isImporting={isImporting}
          importError={importError}
        />
      )}
    </div>
  );
}

function AccordionGroup({
  label,
  isOpen,
  onToggle,
  children,
  showDivider = true,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  showDivider?: boolean;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          width: "100%",
          padding: "7px 10px",
          background: "transparent",
          border: "none",
          borderBottom: showDivider ? "1px solid var(--border-base)" : "none",
          cursor: "pointer",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-xs)",
          fontWeight: 600,
          letterSpacing: "0.06em",
          color: "var(--fg-muted)",
          textAlign: "left",
          transition: "color 120ms ease",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "var(--fg-base)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "var(--fg-muted)";
        }}
      >
        <span
          style={{
            display: "inline-block",
            transition: "transform 150ms ease",
            transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
            fontSize: "0.6rem",
            lineHeight: 1,
          }}
        >
          ▶
        </span>
        {label}
      </button>
      {isOpen && (
        <div
          className="scripture-scroll-pane"
          style={{
            borderBottom: showDivider ? "1px solid var(--border-base)" : "none",
            maxHeight: 200,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function BibleItem({
  bible,
  isSelected,
  onSelect,
}: {
  bible: LocalBibleEntry;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const isDisabled = !bible.available;

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button
        type="button"
        disabled={isDisabled}
        onClick={onSelect}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          width: "100%",
          padding: "5px 12px 5px 24px",
          background: isSelected ? "var(--color-primary-muted)" : "transparent",
          border: "none",
          borderLeft: isSelected ? "2px solid var(--color-primary)" : "2px solid transparent",
          cursor: isDisabled ? "not-allowed" : "pointer",
          fontSize: "var(--text-xs)",
          color: isDisabled ? "var(--fg-subtle)" : isSelected ? "var(--color-primary)" : "var(--fg-muted)",
          textAlign: "left",
          opacity: isDisabled ? 0.58 : 1,
          transition: "background 120ms ease, color 120ms ease",
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={bible.name || bible.abbreviation}
        >
          {bible.name || bible.abbreviation}
        </span>
        {!bible.available && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.62rem",
              color: "var(--fg-subtle)",
            }}
          >
            EMPTY
          </span>
        )}
      </button>
    </div>
  );
}

function AddScriptureModal({
  onClose,
  onImportBible,
  isImporting,
  importError,
}: {
  onClose: () => void;
  onImportBible: () => Promise<void>;
  isImporting: boolean;
  importError: string | null;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add scripture source"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--overlay-backdrop-strong)",
        }}
      />

      {/* Modal card */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-base)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-6) var(--space-6) var(--space-4)",
          minWidth: 280,
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-xs)",
            letterSpacing: "0.08em",
            color: "var(--fg-muted)",
            marginBottom: "var(--space-4)",
          }}
        >
          ADD BIBLE SOURCE
        </div>

        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          <ModalChoiceButton
            icon="📖"
            label={isImporting ? "Importing..." : "Import Local Bible"}
            description={isTauriRuntime() ? "Choose a Zefania or OSIS XML file" : "Open in Tauri to import local files"}
            onClick={() => void onImportBible()}
            disabled={isImporting || !isTauriRuntime()}
          />
          <ModalChoiceButton
            icon="🌐"
            label="Connect API Bible"
            description="API Bible connections are not available yet"
            onClick={() => undefined}
            disabled
          />
        </div>

        {importError && (
          <div
            style={{
              marginTop: "var(--space-3)",
              padding: "8px 10px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-error-border)",
              background: "var(--color-error-muted)",
              color: "var(--fg-base)",
              fontSize: "var(--text-xs)",
              lineHeight: 1.45,
            }}
          >
            {importError}
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          style={{
            display: "block",
            marginTop: "var(--space-4)",
            marginLeft: "auto",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontSize: "var(--text-xs)",
            color: "var(--fg-subtle)",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ModalChoiceButton({
  icon,
  label,
  description,
  onClick,
  disabled,
}: {
  icon: string;
  label: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => {
        if (!disabled) {
          setHovered(true);
        }
      }}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "var(--space-2)",
        padding: "var(--space-4)",
        background: disabled ? "var(--bg-surface)" : hovered ? "var(--color-primary-muted)" : "var(--bg-surface)",
        border: disabled ? "1px solid var(--border-base)" : hovered ? "1px solid var(--color-primary)" : "1px solid var(--border-base)",
        borderRadius: "var(--radius-md)",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 120ms ease, border-color 120ms ease",
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <span style={{ fontSize: "1.5rem", lineHeight: 1 }}>{icon}</span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-xs)",
          fontWeight: 600,
          letterSpacing: "0.06em",
          color: disabled ? "var(--fg-subtle)" : hovered ? "var(--color-primary)" : "var(--fg-base)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: "var(--text-xs)",
          color: "var(--fg-subtle)",
          textAlign: "center",
        }}
      >
        {description}
      </span>
    </button>
  );
}

// ─── Songs tab ────────────────────────────────────────────────────────────────

function SlideThumbnail({
  slide,
  label,
  isPreview,
  isLive,
  isSelected,
  onClick,
  onDoubleClick,
  onFocus,
  onKeyDown,
}: {
  slide: ProjectorSlide;
  label: string;
  isPreview: boolean;
  isLive: boolean;
  isSelected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}) {
  const activeColor = isSelected
    ? "var(--color-primary)"
    : isLive
      ? "var(--color-success)"
      : isPreview
        ? "var(--color-primary)"
    : "transparent";

  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        textAlign: "left",
        width: "100%",
        aspectRatio: "16 / 9",
        padding: "var(--space-2)",
        background: "linear-gradient(180deg, rgba(16, 20, 44, 0.95), rgba(8, 9, 18, 1))",
        border: isSelected
          ? `2px solid ${activeColor}`
          : "1px solid var(--border-base)",
        borderRadius: "var(--radius-md)",
        cursor: "pointer",
        outline: "none",
        position: "relative",
        overflow: "hidden",
        boxShadow: "var(--shadow-sm)",
        transition: "border-color 120ms ease, transform 120ms ease",
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.borderColor = "var(--fg-subtle)";
        }
        e.currentTarget.style.transform = "scale(1.02)";
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.borderColor = "var(--border-base)";
        }
        e.currentTarget.style.transform = "scale(1)";
      }}
    >
      {/* Slide label */}
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "9px",
          fontWeight: 700,
          color: isSelected ? "var(--color-primary)" : isLive ? "var(--color-success)" : isPreview ? "var(--color-primary)" : "#aeb8d0",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>

      {/* Slide text preview */}
      <span
        style={{
          color: "#f4f7ff",
          fontSize: "10px",
          lineHeight: "1.3",
          fontFamily: "Georgia, serif",
          margin: "var(--space-1) 0",
          flex: 1,
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {slide.text}
      </span>

      {/* Small indicator at the bottom right */}
      {isLive && isSelected && (
        <span
          style={{
            position: "absolute",
            bottom: "4px",
            right: "6px",
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: "var(--color-success)",
          }}
        />
      )}
    </button>
  );
}

interface SongContextMenuState {
  song: Song;
  x: number;
  y: number;
}

function SongsTab({ isActive = true, previewReference, liveReference, onPreviewSlide, onSendLive, onCreateCue, searchQuery, onNavigationHandlerChange, slideClickAction, onSlideClickActionChange }: SearchableLibraryTabProps & {
  slideClickAction: "preview" | "live";
  onSlideClickActionChange: (action: "preview" | "live") => void;
}) {
  const songs = useSongStore((s) => s.songs);
  const initializeSongs = useSongStore((s) => s.initialize);
  const deleteSong = useSongStore((s) => s.deleteSong);
  const renameSong = useSongStore((s) => s.renameSong);

  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [hoveredSongId, setHoveredSongId] = useState<string | null>(null);
  const [selectedSlideReference, setSelectedSlideReference] = useState<string | null>(null);
  const [slidesWidth, setSlidesWidth] = useState<number>(738);

  const [isNewSongModalOpen, setIsNewSongModalOpen] = useState(false);
  const [studioSong, setStudioSong] = useState<Song | null>(null);
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<SongContextMenuState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Song | null>(null);
  const [renameTarget, setRenameTarget] = useState<Song | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameArtist, setRenameArtist] = useState("");

  const gridRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ mouseX: 0, slidesWidth: 0 });

  useEffect(() => {
    initializeSongs();
  }, [initializeSongs]);

  useEffect(() => {
    if (!contextMenu) return;
    const handlePointerDown = () => setContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  const normalizedSearchQuery = normalizeSearch(searchQuery);

  // Keep the library in a predictable title order while applying the shared search.
  const filteredSongs = useMemo(() => {
    return songs.filter((song) => {
      if (!normalizedSearchQuery) {
        return true;
      }

      return `${song.title} ${song.artist} ${song.slides.map((slide) => `${slide.label} ${slide.text}`).join(" ")}`
        .toLowerCase()
        .includes(normalizedSearchQuery);
    }).sort((first, second) => first.title.localeCompare(second.title, undefined, { sensitivity: "base" }));
  }, [normalizedSearchQuery, songs]);

  // Find currently selected song
  const selectedSong = useMemo(() => {
    return songs.find((song) => song.id === selectedSongId) ?? null;
  }, [selectedSongId, songs]);

  const handleSongSelect = (songId: string) => {
    setSelectedSongId(songId);
    setSelectedSlideReference(null);
  };

  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!gridRef.current) return;

    dragStartRef.current = {
      mouseX: e.clientX,
      slidesWidth: slidesWidth,
    };
    isDraggingRef.current = true;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current || !gridRef.current) return;
      const deltaX = moveEvent.clientX - dragStartRef.current.mouseX;
      const nextSlidesWidth = dragStartRef.current.slidesWidth - deltaX;

      const containerWidth = gridRef.current.clientWidth;
      const minSlides = 220;
      const maxSlides = Math.max(minSlides, containerWidth - 300);

      setSlidesWidth(Math.min(maxSlides, Math.max(minSlides, nextSlidesWidth)));
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Helper to map a song slide to a ProjectorSlide
  const toSongProjectorSlide = (song: Song, slide: SongSlide, index: number): ProjectorSlide => {
    return {
      reference: {
        book: song.title,
        chapter: 1,
        verse: index + 1,
      },
      text: slide.text,
      version: "SONG",
    };
  };

  const navigateSongSlides = useCallback(
    (direction: -1 | 1) => {
      const song = selectedSong ?? filteredSongs[0];
      if (!song || song.slides.length === 0) return;

      if (!selectedSong) setSelectedSongId(song.id);
      const currentReference = selectedSlideReference ?? (slideClickAction === "preview" ? previewReference : liveReference);
      const currentIndex = song.slides.findIndex((_, index) => `${song.title} 1:${index + 1}` === currentReference);
      const nextIndex = (currentIndex + direction + song.slides.length) % song.slides.length;
      const nextSlide = toSongProjectorSlide(song, song.slides[nextIndex], nextIndex);
      setSelectedSlideReference(`${song.title} 1:${nextIndex + 1}`);
      if (slideClickAction === "preview") onPreviewSlide(nextSlide);
      else onSendLive(nextSlide);
    },
    [filteredSongs, liveReference, onPreviewSlide, onSendLive, previewReference, selectedSlideReference, selectedSong, slideClickAction],
  );

  useEffect(() => {
    if (!isActive) return;
    onNavigationHandlerChange?.(navigateSongSlides);
    return () => onNavigationHandlerChange?.(null);
  }, [isActive, navigateSongSlides, onNavigationHandlerChange]);

  const handleSongKeyDownCapture = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    // Song Studio's textarea is portaled but still bubbles through this tree; let it handle its own cursor movement.
    const target = event.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    navigateSongSlides(event.key === "ArrowLeft" ? -1 : 1);
  };

  const confirmRename = () => {
    if (!renameTarget || !renameTitle.trim()) return;
    renameSong(renameTarget.id, renameTitle.trim(), renameArtist.trim());
    setRenameTarget(null);
  };

  return (
    <div
      onKeyDownCapture={handleSongKeyDownCapture}
      style={{
        display: "flex",
        height: "100%",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        ref={gridRef}
        style={{
          flex: 1,
          minWidth: 0,
          height: "100%",
          display: "grid",
          gridTemplateColumns: `minmax(0, 1.2fr) auto ${slidesWidth}px`,
          gridTemplateRows: "100%",
          overflow: "hidden",
          borderRight: "1px solid var(--border-base)",
        }}
      >
        {/* Column 1: Song (title + artiste in a single row, single highlight) */}
        <div style={{ position: "relative", minWidth: 0, minHeight: 0, overflow: "hidden", background: "var(--bg-base)" }}>
          <ScripturePane
            title="Song Title"
            showDivider={false}
            action={
              <span style={{ flex: "0 0 140px", textAlign: "right", color: "var(--fg-muted)" }}>Artiste</span>
            }
          >
          {filteredSongs.map((song) => {
            const isSongActive = selectedSongId === song.id;
            const isSongHighlighted = isSongActive || hoveredSongId === song.id;
            return (
              <button
                key={song.id}
                type="button"
                onMouseEnter={() => setHoveredSongId(song.id)}
                onMouseLeave={() => setHoveredSongId((current) => (current === song.id ? null : current))}
                onClick={() => {
                  handleSongSelect(song.id);
                }}
                onDoubleClick={() => {
                  const firstSlide = song.slides[0];
                  if (!firstSlide) return;
                  handleSongSelect(song.id);
                  onSendLive(toSongProjectorSlide(song, firstSlide, 0));
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ song, x: e.clientX, y: e.clientY });
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  width: "100%",
                  boxSizing: "border-box",
                  minHeight: 30,
                  padding: "6px 12px",
                  background: isSongHighlighted ? "var(--color-primary-muted)" : "transparent",
                  border: "none",
                  borderLeft: isSongActive ? "2px solid var(--color-primary)" : "2px solid transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  outline: "none",
                }}
              >
                <span
                  style={{
                    flex: "1 1 auto",
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: "var(--text-xs)",
                    fontWeight: isSongActive ? 600 : 400,
                    color: isSongHighlighted ? "var(--color-primary)" : "var(--fg-base)",
                  }}
                >
                  {song.title}
                </span>
                <span
                  title={song.artist}
                  style={{
                    flex: "0 0 140px",
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    textAlign: "right",
                    fontSize: "var(--text-xs)",
                    fontWeight: isSongActive ? 600 : 400,
                    color: isSongHighlighted ? "var(--color-primary)" : "var(--fg-muted)",
                  }}
                >
                  {song.artist}
                </span>
              </button>
            );
          })}
          {filteredSongs.length === 0 && (
            <div
              style={{
                padding: "24px 16px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "12px",
                textAlign: "center",
              }}
            >
              <span style={{ fontSize: "12px", color: "var(--fg-subtle)", fontStyle: "italic" }}>
                {normalizedSearchQuery ? "No matching songs" : "No songs in library"}
              </span>
              {!normalizedSearchQuery && (
                <button
                  type="button"
                  onClick={() => setIsNewSongModalOpen(true)}
                  aria-label="Add song"
                  title="Add song"
                  style={addSongButtonStyle}
                >
                  +
                </button>
              )}
            </div>
          )}
          </ScripturePane>

          {/* Add Song button, pinned to bottom-right of the song column */}
          <button
            type="button"
            onClick={() => setIsNewSongModalOpen(true)}
            aria-label="Add song"
            title="Add song"
            style={{
              position: "absolute",
              right: "16px",
              bottom: "16px",
              zIndex: 5,
              ...addSongButtonStyle,
            }}
          >
            +
          </button>
        </div>

        {/* Column 2: Draggable Demarcation Line */}
        <div
          onMouseDown={handleDividerMouseDown}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize column"
          style={{
            gridColumn: "2",
            width: "7px",
            height: "100%",
            cursor: "col-resize",
            background: "transparent",
            display: "flex",
            justifyContent: "center",
            marginLeft: "-3px",
            marginRight: "-3px",
            zIndex: 10,
            userSelect: "none",
            position: "relative",
          }}
        >
          <div
            style={{
              width: "1px",
              height: "100%",
              background: "var(--border-base)",
            }}
          />
        </div>

        {/* Column 3: Slides (4 per row) */}
        <ScripturePane
          title="Slides"
          action={
            <div role="group" aria-label="Slide click action" style={{ display: "flex", overflow: "hidden", borderRadius: "var(--radius-sm)" }}>
              <button
                type="button"
                aria-pressed={slideClickAction === "preview"}
                onClick={() => onSlideClickActionChange("preview")}
                style={slideActionButtonStyle(slideClickAction === "preview")}
              >
                Preview First
              </button>
              <button
                type="button"
                aria-pressed={slideClickAction === "live"}
                onClick={() => onSlideClickActionChange("live")}
                style={slideActionButtonStyle(slideClickAction === "live")}
              >
                Live
              </button>
            </div>
          }
        >
          {selectedSong ? (
            <div style={{ padding: "var(--space-3)" }}>
              <div
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-base)",
                  borderRadius: "var(--radius-lg)",
                  padding: "var(--space-4)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-3)",
                  boxShadow: "var(--shadow-md)",
                }}
              >
                {/* 4-up Grid */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: "var(--space-3)",
                  }}
                >
                  {selectedSong.slides.map((slide, index) => {
                    const projSlide = toSongProjectorSlide(selectedSong, slide, index);
                    const label = `${projSlide.reference.book} ${projSlide.reference.chapter}:${projSlide.reference.verse}`;
                    const isPreview = previewReference === label;
                    const isLive = liveReference === label;
                    const isSelected = selectedSlideReference === label || (selectedSlideReference === null && (isPreview || isLive));
                    const selectSlide = () => setSelectedSlideReference(label);
                    const sendSlideLive = () => {
                      selectSlide();
                      onSendLive(projSlide);
                    };
                    const previewSlide = () => {
                      selectSlide();
                      onPreviewSlide(projSlide);
                    };

                    return (
                      <div key={index} style={{ position: "relative" }}>
                      <SlideThumbnail
                        key={index}
                        slide={projSlide}
                        label={slide.label}
                        isPreview={isPreview}
                        isLive={isLive}
                        isSelected={isSelected}
                        onClick={slideClickAction === "preview" ? previewSlide : sendSlideLive}
                        onDoubleClick={slideClickAction === "preview" ? sendSlideLive : () => {}}
                        onFocus={selectSlide}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            if (slideClickAction === "preview") {
                              previewSlide();
                            } else {
                              sendSlideLive();
                            }
                          }
                        }}
                      />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <PaneEmpty>Select a song to view slides</PaneEmpty>
          )}
        </ScripturePane>
      </div>

      {/* Right-click Context Menu */}
      {contextMenu ? (
        <div
          role="menu"
          onPointerDown={(event) => event.stopPropagation()}
          style={{
            position: "fixed",
            left: Math.min(contextMenu.x, window.innerWidth - 180),
            top: Math.min(contextMenu.y, window.innerHeight - 140),
            width: "160px",
            background: "var(--bg-surface)",
            border: "none",
            borderRadius: "8px",
            boxShadow: "var(--shadow-lg)",
            padding: "4px",
            zIndex: 1000,
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const s = contextMenu.song;
              setContextMenu(null);
              setStudioSong(s);
              setIsStudioOpen(true);
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = "var(--color-primary-muted)";
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = "transparent";
            }}
            style={songContextMenuItemStyle}
          >
            Edit
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const s = contextMenu.song;
              setContextMenu(null);
              setRenameTarget(s);
              setRenameTitle(s.title);
              setRenameArtist(s.artist);
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = "var(--color-primary-muted)";
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = "transparent";
            }}
            style={songContextMenuItemStyle}
          >
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const s = contextMenu.song;
              setContextMenu(null);
              setDeleteTarget(s);
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = "var(--color-error-muted)";
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = "transparent";
            }}
            style={{ ...songContextMenuItemStyle, color: "var(--color-error)" }}
          >
            Delete
          </button>
        </div>
      ) : null}

      {deleteTarget ? createPortal(
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDeleteTarget(null);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1200,
            display: "grid",
            placeItems: "center",
            padding: 20,
            background: "var(--overlay-backdrop)",
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-song-title"
            aria-describedby="delete-song-description"
            style={{
              width: "min(400px, 94vw)",
              padding: 20,
              border: "1px solid var(--border-base)",
              borderRadius: "var(--radius-lg)",
              background: "var(--bg-surface)",
              boxShadow: "var(--shadow-lg)",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <h2 id="delete-song-title" style={{ margin: 0, color: "var(--fg-base)", fontSize: 16, fontWeight: 700 }}>
              Delete song?
            </h2>
            <p id="delete-song-description" style={{ margin: 0, color: "var(--fg-muted)", fontSize: 12, lineHeight: 1.5 }}>
              Delete &quot;{deleteTarget.title}&quot;? This cannot be undone.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                autoFocus
                onClick={() => setDeleteTarget(null)}
                style={renameSecondaryButton}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteSong(deleteTarget.id);
                  if (selectedSongId === deleteTarget.id) setSelectedSongId(null);
                  setDeleteTarget(null);
                }}
                style={deleteSongButton}
              >
                Delete
              </button>
            </div>
          </section>
        </div>,
        document.body,
      ) : null}

      {/* Rename Dialog */}
      {renameTarget ? createPortal(
        <div
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setRenameTarget(null);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1200,
            display: "grid",
            placeItems: "center",
            padding: 20,
            background: "rgba(8, 9, 14, 0.6)",
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-song-title"
            style={{
              width: "min(400px, 94vw)",
              padding: 20,
              border: "1px solid var(--border-base)",
              borderRadius: 10,
              background: "var(--bg-surface)",
              boxShadow: "var(--shadow-lg)",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <h2 id="rename-song-title" style={{ margin: 0, color: "var(--fg-base)", fontSize: 16, fontWeight: 700 }}>
              Rename song
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, color: "var(--fg-muted)", fontSize: 12 }}>
                Title
                <input
                  autoFocus
                  value={renameTitle}
                  onChange={(e) => setRenameTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmRename();
                    if (e.key === "Escape") setRenameTarget(null);
                  }}
                  style={{
                    padding: "8px 10px",
                    border: "1px solid var(--border-base)",
                    borderRadius: 6,
                    background: "var(--bg-base)",
                    color: "var(--fg-base)",
                    fontSize: 13,
                    outline: "none",
                  }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, color: "var(--fg-muted)", fontSize: 12 }}>
                Artist
                <input
                  value={renameArtist}
                  onChange={(e) => setRenameArtist(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmRename();
                    if (e.key === "Escape") setRenameTarget(null);
                  }}
                  style={{
                    padding: "8px 10px",
                    border: "1px solid var(--border-base)",
                    borderRadius: 6,
                    background: "var(--bg-base)",
                    color: "var(--fg-base)",
                    fontSize: 13,
                    outline: "none",
                  }}
                />
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                style={{
                  padding: "8px 14px",
                  border: "none",
                  borderRadius: 6,
                  background: "var(--bg-elevated)",
                  color: "var(--fg-base)",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRename}
                disabled={!renameTitle.trim()}
                style={{
                  padding: "8px 14px",
                  border: "none",
                  borderRadius: 6,
                  background: "var(--color-primary)",
                  color: "var(--fg-on-accent)",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  opacity: renameTitle.trim() ? 1 : 0.5,
                }}
              >
                Save
              </button>
            </div>
          </section>
        </div>,
        document.body
      ) : null}

      {/* New Song Modal */}
      <NewSongModal
        open={isNewSongModalOpen}
        onClose={() => setIsNewSongModalOpen(false)}
        onSongCreated={(newSong) => {
          setIsNewSongModalOpen(false);
          setStudioSong(newSong);
          setIsStudioOpen(true);
        }}
      />

      {/* Song Studio Modal */}
      <SongStudioModal
        open={isStudioOpen}
        song={studioSong}
        onCreateCue={onCreateCue}
        onClose={() => {
          setIsStudioOpen(false);
          setStudioSong(null);
        }}
      />
    </div>
  );
}

const addSongButtonStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  display: "grid",
  placeItems: "center",
  padding: 0,
  border: "1px solid var(--border-base)",
  borderRadius: "var(--radius-sm)",
  background: "var(--bg-elevated)",
  color: "var(--fg-base)",
  fontFamily: "var(--font-mono)",
  fontSize: 18,
  lineHeight: 1,
  cursor: "pointer",
  boxShadow: "var(--shadow-sm)",
  transition: "background 120ms ease, border-color 120ms ease, color 120ms ease",
};

function slideActionButtonStyle(isActive: boolean): React.CSSProperties {
  return {
    border: "none",
    outline: "none",
    padding: "3px 7px",
    background: isActive ? "var(--color-primary)" : "var(--bg-elevated)",
    color: isActive ? "var(--fg-on-accent)" : "var(--fg-muted)",
    cursor: "pointer",
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    fontWeight: 700,
    whiteSpace: "nowrap",
  };
}

const songContextMenuItemStyle: React.CSSProperties = {
  width: "100%",
  border: "none",
  background: "transparent",
  borderRadius: "6px",
  padding: "8px 10px",
  textAlign: "left",
  color: "var(--fg-base)",
  fontFamily: "var(--font-sans)",
  fontSize: "12px",
  cursor: "pointer",
};

const deleteSongButton: React.CSSProperties = {
  padding: "8px 13px",
  border: "none",
  borderRadius: 6,
  background: "var(--color-error)",
  color: "var(--fg-on-accent)",
  cursor: "pointer",
  fontSize: 12,
};

// ─── Media tab ────────────────────────────────────────────────────────────────

const MEDIA_STORAGE_KEY = "sermonsync-media-library-v1";
const MEDIA_CATALOG_EVENT = "sermonsync-media-catalog-changed";
const MEDIA_IMPORT_EVENT = "sermonsync-media-import-changed";
type PendingVideo = { path: string; name: string; state: string; percent: number | null; error?: string; assetId?: string; recoveryInFlight?: boolean; startedAt: number; controller: AbortController };
const pendingVideos = new Map<string, PendingVideo>();
const migratingVideos = new Set<string>();

function notifyMediaCatalog(): void {
  window.dispatchEvent(new Event(MEDIA_CATALOG_EVENT));
}

function notifyMediaImports(): void {
  window.dispatchEvent(new Event(MEDIA_IMPORT_EVENT));
}

function mutateSavedMediaItems(update: (items: MediaItem[]) => MediaItem[]): void {
  saveMediaItems(update(loadMediaItems()));
  notifyMediaCatalog();
}

function finishMediaVideoImport(path: string, controller: AbortController, asset: VideoAsset): void {
  const entry = pendingVideos.get(path);
  if (!entry || entry.controller !== controller || controller.signal.aborted) return;
  mutateSavedMediaItems((current) => current.some((item) => item.category === "videos" && item.path === asset.path)
    ? current
    : [...current, withDefaultSettings({ id: `videos-${asset.id}`, name: entry.name, path: asset.path, category: "videos" })]);
  pendingVideos.delete(path);
  notifyMediaImports();
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function loadMediaItems(): MediaItem[] {
  try {
    const raw = window.localStorage.getItem(MEDIA_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MediaItem[]) : [];
  } catch {
    return [];
  }
}

function saveMediaItems(items: MediaItem[]): void {
  try {
    window.localStorage.setItem(MEDIA_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage unavailable (e.g. private browsing) — gallery just won't persist.
  }
}

interface MediaContextMenuState {
  item: MediaItem;
  x: number;
  y: number;
}

function withDefaultSettings(item: MediaItem): MediaItem {
  if (item.category === "images" && !item.imageSettings) {
    return { ...item, imageSettings: { ...DEFAULT_IMAGE_SETTINGS, filters: { ...DEFAULT_IMAGE_SETTINGS.filters } } };
  }
  if (item.category === "videos" && !item.videoSettings) {
    return { ...item, videoSettings: { ...DEFAULT_VIDEO_SETTINGS, filters: { ...DEFAULT_VIDEO_SETTINGS.filters } } };
  }
  if (item.category === "audio" && !item.audioSettings) {
    return { ...item, audioSettings: { ...DEFAULT_AUDIO_SETTINGS } };
  }
  return item;
}

function MediaTab({ onPreviewMedia, onSendMedia, clickAction, onClickActionChange, previewMedia, liveMedia }: {
  onPreviewMedia: (media: ProjectorMedia) => void;
  onSendMedia: (media: ProjectorMedia) => void;
  clickAction: "preview" | "live";
  onClickActionChange: (action: "preview" | "live") => void;
  previewMedia?: ProjectorMedia | null;
  liveMedia?: ProjectorMedia | null;
}) {
  const [items, setItems] = useState<MediaItem[]>(() => loadMediaItems().map(withDefaultSettings));
  const [selectedMediaPath, setSelectedMediaPath] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<MediaCategory>("images");
  const [importError, setImportError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<MediaContextMenuState | null>(null);
  const [renameTarget, setRenameTarget] = useState<MediaItem | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<MediaItem | null>(null);
  const [studioTarget, setStudioTarget] = useState<MediaItem | null>(null);
  const [pending, setPending] = useState<PendingVideo[]>(() => [...pendingVideos.values()]);
  const galleryRef = useRef<HTMLElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refreshCatalog = () => setItems(loadMediaItems().map(withDefaultSettings));
    const refreshPending = () => setPending([...pendingVideos.values()]);
    window.addEventListener(MEDIA_CATALOG_EVENT, refreshCatalog);
    window.addEventListener(MEDIA_IMPORT_EVENT, refreshPending);
    return () => {
      window.removeEventListener(MEDIA_CATALOG_EVENT, refreshCatalog);
      window.removeEventListener(MEDIA_IMPORT_EVENT, refreshPending);
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    const timer = window.setInterval(() => {
      for (const [path, entry] of pendingVideos) {
        if (!entry.assetId || entry.error || entry.controller.signal.aborted || entry.recoveryInFlight || Date.now() - entry.startedAt < 15000) continue;
        entry.recoveryInFlight = true;
        void invoke<VideoAsset | null>("get_ready_video_asset", { assetId: entry.assetId })
          .then((asset) => { if (asset) finishMediaVideoImport(path, entry.controller, asset); })
          .catch(() => { /* The normal import request still reports the actionable error. */ })
          .finally(() => { entry.recoveryInFlight = false; });
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    for (const item of items) {
      if (item.category !== "videos" || isManagedVideo(item.path) || migratingVideos.has(item.id)) continue;
      migratingVideos.add(item.id);
      void importVideo(item.path, { legacy: true }).then((asset) => {
        mutateSavedMediaItems((current) => current.map((entry) =>
          entry.id === item.id && entry.path === item.path ? { ...entry, path: asset.path } : entry));
      }).catch((error) => {
        console.warn("Existing video remains on its original path until migration succeeds", importErrorMessage(error));
      }).finally(() => migratingVideos.delete(item.id));
    }
  }, [items]);

  useEffect(() => {
    if (!contextMenu) return;
    const gallery = galleryRef.current;
    const handlePointerDown = () => setContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handlePointerDown);
    gallery?.addEventListener("scroll", handlePointerDown, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handlePointerDown);
      gallery?.removeEventListener("scroll", handlePointerDown, true);
    };
  }, [contextMenu]);

  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const menu = contextMenuRef.current;
    const panel = galleryRef.current?.getBoundingClientRect();
    const viewport = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const position = contextMenuPosition(
      { x: contextMenu.x, y: contextMenu.y },
      { width: menu.getBoundingClientRect().width || 168, height: menu.getBoundingClientRect().height || 112 },
      panel ?? viewport,
      viewport,
    );
    menu.style.left = `${position.x}px`;
    menu.style.top = `${position.y}px`;
    menu.style.visibility = "visible";
  }, [contextMenu]);

  const countsByCategory = useMemo(() => {
    const counts: Record<MediaCategory, number> = { audio: 0, images: 0, videos: 0 };
    for (const item of items) {
      counts[item.category] += 1;
    }
    return counts;
  }, [items]);

  const visibleItems = useMemo(
    () => items.filter((item) => item.category === selectedCategory),
    [items, selectedCategory],
  );
  const selectMedia = useCallback((path: string) => setSelectedMediaPath(path), []);
  const openMediaMenu = useCallback((event: React.MouseEvent, item: MediaItem) => {
    event.preventDefault();
    setContextMenu({ item, x: event.clientX, y: event.clientY });
  }, []);

  const handleImport = useCallback(async () => {
    setImportError(null);
    try {
      if (!isTauriRuntime()) {
        throw new Error("Open SermonSync in Tauri to import local media files.");
      }

      const selected = await open({
        multiple: true,
      });

      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      // Let the native probe inspect unfamiliar extensions. They may still be
      // perfectly valid videos, and the engine gives a useful error if not.
      const accepted = paths.map((path) => ({ path, category: mediaCategoryForPath(path) ?? "videos" as MediaCategory }));

      mutateSavedMediaItems((current) => {
        const existingPaths = new Set(current.map((item) => item.path));
        const additions: MediaItem[] = accepted.filter((entry) => entry.category !== "videos").flatMap(({ path, category }) => {
          if (existingPaths.has(path)) return [];
          existingPaths.add(path);
          return [withDefaultSettings({ id: `${category}-${path}`, name: fileNameFromPath(path), path, category })];
        });
        return [...current, ...additions];
      });
      for (const { path, category } of accepted) {
        if (category !== "videos" || pendingVideos.has(path)) continue;
        if (loadMediaItems().some((item) => item.category === "videos" && item.path === path)) continue;
        const controller = new AbortController();
        const entry: PendingVideo = { path, name: fileNameFromPath(path), state: "queued", percent: null, startedAt: Date.now(), controller };
        pendingVideos.set(path, entry);
        notifyMediaImports();
        void importVideo(path, {
          maxSourceBytes: 600 * 1024 * 1024,
          signal: controller.signal,
          onProgress: (event: VideoImportProgress) => {
            const current = pendingVideos.get(path);
            if (!current || current.controller !== controller) return;
            pendingVideos.set(path, { ...current, state: event.state, percent: event.percent, assetId: event.assetId ?? current.assetId });
            notifyMediaImports();
          },
        }).then((asset) => {
          finishMediaVideoImport(path, controller, asset);
        }).catch((error) => {
          if (pendingVideos.get(path)?.controller !== controller) return;
          if (controller.signal.aborted) {
            pendingVideos.delete(path);
            notifyMediaImports();
            return;
          }
          pendingVideos.set(path, { ...entry, state: "failed", percent: null, error: importErrorMessage(error) });
          notifyMediaImports();
        });
      }
      if (accepted.length > 0) setSelectedCategory(accepted[0].category);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Failed to import media.");
    }
  }, []);

  const handleRemove = useCallback((id: string) => {
    mutateSavedMediaItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const handleRename = useCallback((id: string, name: string) => {
    mutateSavedMediaItems((current) => current.map((item) => (item.id === id ? { ...item, name } : item)));
  }, []);

  const handleUpdateSettings = useCallback((id: string, patch: Partial<MediaItem>) => {
    mutateSavedMediaItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const activeCategoryLabel = MEDIA_CATEGORIES.find((entry) => entry.id === selectedCategory)?.label ?? "";

  const confirmRename = () => {
    if (!renameTarget || !renameValue.trim()) return;
    handleRename(renameTarget.id, renameValue.trim());
    setRenameTarget(null);
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Column 1: media types */}
      <div style={{ position: "relative", width: 220, height: "100%", flexShrink: 0 }}>
      <ScripturePane title="Media Type" width="100%">
        {MEDIA_CATEGORIES.map((category) => {
          const isActive = selectedCategory === category.id;
          return (
            <ScriptureCellButton key={category.id} isActive={isActive} onClick={() => setSelectedCategory(category.id)}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                <span>{category.label}</span>
                <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {countsByCategory[category.id]}
                </span>
              </span>
            </ScriptureCellButton>
          );
        })}
        {importError && (
          <div style={{ padding: "10px 12px", color: "var(--color-error)", fontSize: "var(--text-xs)" }}>
            {importError}
          </div>
        )}
      </ScripturePane>
      <button
        type="button"
        aria-label="Import media files"
        title="Import audio, images, or videos"
        onClick={() => void handleImport()}
        style={{ ...addSongButtonStyle, position: "absolute", right: 16, bottom: 16, zIndex: 5 }}
      >
        +
      </button>
      </div>

      {/* Column 2: gallery of thumbnails for the selected category */}
      <section
        data-media-gallery=""
        ref={galleryRef}
        style={{
          flex: 1,
          minWidth: 0,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "var(--bg-base)",
        }}
      >
        <div style={{ ...tableHeaderCellStyle(), display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span>{activeCategoryLabel} Gallery</span>
          <div role="group" aria-label="Media click action" style={{ display: "flex", overflow: "hidden", borderRadius: "var(--radius-sm)" }}>
            <button type="button" aria-pressed={clickAction === "preview"} disabled={selectedCategory === "audio"} title={selectedCategory === "audio" ? "Audio plays locally from its thumbnail" : undefined} onClick={() => onClickActionChange("preview")} style={{ ...slideActionButtonStyle(clickAction === "preview"), opacity: selectedCategory === "audio" ? 0.45 : 1 }}>Preview First</button>
            <button type="button" aria-pressed={clickAction === "live"} disabled={selectedCategory === "audio"} title={selectedCategory === "audio" ? "Audio plays locally from its thumbnail" : undefined} onClick={() => onClickActionChange("live")} style={{ ...slideActionButtonStyle(clickAction === "live"), opacity: selectedCategory === "audio" ? 0.45 : 1 }}>Live</button>
          </div>
        </div>
        <div className="scripture-scroll-pane" style={{ flex: 1, minHeight: 0, padding: "var(--space-3)" }}>
          {visibleItems.length === 0 ? (
            selectedCategory === "videos" && pending.length > 0 ? null : <PaneEmpty>No {activeCategoryLabel.toLowerCase()} imported yet — use the + button in Media Type to add files.</PaneEmpty>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: "var(--space-3)",
              }}
            >
              {visibleItems.map((item) => (
                <MediaThumbnail
                  key={item.id}
                  item={item}
                  isSelected={item.path === (selectedMediaPath ?? (clickAction === "preview" ? previewMedia?.path : liveMedia?.path))}
                  onSelect={selectMedia}
                  onContextMenu={openMediaMenu}
                  clickAction={clickAction}
                  onPreviewMedia={onPreviewMedia}
                  onSendMedia={onSendMedia}
                />
              ))}
            </div>
          )}
          {selectedCategory === "videos" && pending.map((entry) => (
            <div key={entry.path} role="status" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, padding: 10, borderRadius: 6, background: "var(--bg-elevated)", color: "var(--fg-muted)", fontSize: 12 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={entry.name}>{entry.name}</span>
              <span>{entry.error ?? `${entry.state}${entry.percent == null ? "" : ` ${entry.percent}%`}`}</span>
              <button type="button" onClick={() => {
                if (entry.error) pendingVideos.delete(entry.path);
                else entry.controller.abort();
                notifyMediaImports();
              }} aria-label={entry.error ? `Dismiss ${entry.name}` : `Cancel import ${entry.name}`}>{entry.error ? "Dismiss" : "Cancel"}</button>
            </div>
          ))}
        </div>
      </section>

      {/* Right-click Context Menu */}
      {contextMenu ? createPortal(
        <div
          ref={contextMenuRef}
          role="menu"
          onPointerDown={(event) => event.stopPropagation()}
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            visibility: "hidden",
            width: "160px",
            background: "var(--bg-surface)",
            border: "none",
            borderRadius: "8px",
            boxShadow: "var(--shadow-lg)",
            padding: "4px",
            zIndex: 1000,
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const target = contextMenu.item;
              setContextMenu(null);
              setStudioTarget(target);
            }}
            onMouseEnter={(event) => { event.currentTarget.style.background = "var(--color-primary-muted)"; }}
            onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}
            style={songContextMenuItemStyle}
          >
            Edit
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const target = contextMenu.item;
              setContextMenu(null);
              setRenameTarget(target);
              setRenameValue(target.name);
            }}
            onMouseEnter={(event) => { event.currentTarget.style.background = "var(--color-primary-muted)"; }}
            onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}
            style={songContextMenuItemStyle}
          >
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const target = contextMenu.item;
              setContextMenu(null);
              setDeleteTarget(target);
            }}
            onMouseEnter={(event) => { event.currentTarget.style.background = "var(--color-error-muted)"; }}
            onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}
            style={{ ...songContextMenuItemStyle, color: "var(--color-error)" }}
          >
            Delete
          </button>
        </div>,
        document.body,
      ) : null}

      {/* Delete confirmation */}
      {deleteTarget ? createPortal(
        <div
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteTarget(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 1200, display: "grid", placeItems: "center", padding: 20, background: "var(--overlay-backdrop)" }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-media-title"
            aria-describedby="delete-media-description"
            style={{ width: "min(400px, 94vw)", padding: 20, border: "1px solid var(--border-base)", borderRadius: "var(--radius-lg)", background: "var(--bg-surface)", boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column", gap: 14 }}
          >
            <h2 id="delete-media-title" style={{ margin: 0, color: "var(--fg-base)", fontSize: 16, fontWeight: 700 }}>Delete media?</h2>
            <p id="delete-media-description" style={{ margin: 0, color: "var(--fg-muted)", fontSize: 12, lineHeight: 1.5 }}>
              Remove &quot;{deleteTarget.name}&quot; from the library? This cannot be undone.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" autoFocus onClick={() => setDeleteTarget(null)} style={renameSecondaryButton}>Cancel</button>
              <button
                type="button"
                onClick={() => {
                  handleRemove(deleteTarget.id);
                  setDeleteTarget(null);
                }}
                style={deleteSongButton}
              >
                Delete
              </button>
            </div>
          </section>
        </div>,
        document.body,
      ) : null}

      {/* Rename dialog */}
      {renameTarget ? createPortal(
        <div
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setRenameTarget(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 1200, display: "grid", placeItems: "center", padding: 20, background: "rgba(8, 9, 14, 0.6)" }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="rename-media-title" style={{ width: "min(400px, 94vw)", padding: 20, border: "1px solid var(--border-base)", borderRadius: 10, background: "var(--bg-surface)", boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column", gap: 14 }}>
            <h2 id="rename-media-title" style={{ margin: 0, color: "var(--fg-base)", fontSize: 16, fontWeight: 700 }}>Rename media</h2>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, color: "var(--fg-muted)", fontSize: 12 }}>
              Name
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmRename();
                  if (e.key === "Escape") setRenameTarget(null);
                }}
                style={{ padding: "8px 10px", border: "1px solid var(--border-base)", borderRadius: 6, background: "var(--bg-base)", color: "var(--fg-base)", fontSize: 13, outline: "none" }}
              />
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={() => setRenameTarget(null)} style={renameSecondaryButton}>Cancel</button>
              <button
                type="button"
                onClick={confirmRename}
                disabled={!renameValue.trim()}
                style={{ padding: "8px 14px", border: "none", borderRadius: 6, background: "var(--color-primary)", color: "var(--fg-on-accent)", cursor: "pointer", fontSize: 12, fontWeight: 600, opacity: renameValue.trim() ? 1 : 0.5 }}
              >
                Save
              </button>
            </div>
          </section>
        </div>,
        document.body,
      ) : null}

      {/* Category-specific studio editors */}
      {studioTarget?.category === "images" ? (
        <ImageStudioModal
          open
          name={studioTarget.name}
          src={studioTarget.path ? (() => { try { return managedVideoUrl(studioTarget.path) ?? convertFileSrc(studioTarget.path); } catch { return ""; } })() : ""}
          sourcePath={studioTarget.path}
          settings={studioTarget.imageSettings ?? DEFAULT_IMAGE_SETTINGS}
          onClose={() => setStudioTarget(null)}
          onSave={(name, settings: ImageMediaSettings) => {
            handleUpdateSettings(studioTarget.id, { name, imageSettings: settings });
            setStudioTarget(null);
          }}
        />
      ) : null}
      {studioTarget?.category === "videos" ? (
        <VideoStudioModal
          open
          name={studioTarget.name}
          src={studioTarget.path ? (() => { try { return managedVideoUrl(studioTarget.path) ?? convertFileSrc(studioTarget.path); } catch { return ""; } })() : ""}
          sourcePath={studioTarget.path}
          settings={studioTarget.videoSettings ?? DEFAULT_VIDEO_SETTINGS}
          onClose={() => setStudioTarget(null)}
          onSave={(name, settings: VideoMediaSettings) => {
            handleUpdateSettings(studioTarget.id, { name, videoSettings: settings });
            setStudioTarget(null);
          }}
        />
      ) : null}
      {studioTarget?.category === "audio" ? (
        <AudioStudioModal
          open
          name={studioTarget.name}
          src={studioTarget.path ? (() => { try { return managedVideoUrl(studioTarget.path) ?? convertFileSrc(studioTarget.path); } catch { return ""; } })() : ""}
          settings={studioTarget.audioSettings ?? DEFAULT_AUDIO_SETTINGS}
          onClose={() => setStudioTarget(null)}
          onSave={(name, settings: AudioMediaSettings) => {
            handleUpdateSettings(studioTarget.id, { name, audioSettings: settings });
            setStudioTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}

const MediaThumbnail = memo(function MediaThumbnail({ item, isSelected, onSelect, clickAction, onContextMenu, onPreviewMedia, onSendMedia }: {
  item: MediaItem;
  isSelected: boolean;
  onSelect: (path: string) => void;
  clickAction: "preview" | "live";
  onContextMenu: (event: React.MouseEvent, item: MediaItem) => void;
  onPreviewMedia: (media: ProjectorMedia) => void;
  onSendMedia: (media: ProjectorMedia) => void;
}) {
  const tileRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [inView, setInView] = useState(() => typeof IntersectionObserver === "undefined");
  const [thumbnail, setThumbnail] = useState<{ key: string; src: string | null } | null>(null);
  const [failedPosterPath, setFailedPosterPath] = useState<string | null>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const src = useMemo(() => {
    try { return managedVideoUrl(item.path) ?? convertFileSrc(item.path); } catch { return ""; }
  }, [item.path]);
  const thumbnailKey = `${item.category}:${item.path}`;
  const nativeRuntime = isTauriRuntime();
  const managedPoster = item.category === "videos" ? managedVideoPosterUrl(item.path) : null;
  const posterFailed = managedPoster !== null && failedPosterPath === item.path;
  const snapshot = managedPoster !== null ? posterFailed ? null : managedPoster : thumbnail?.key === thumbnailKey ? thumbnail.src : undefined;
  const useFallback = !nativeRuntime || snapshot === null;
  const { peaks, duration } = useAudioPeaks(item.category === "audio" && inView && useFallback ? src : null, 64);
  const projectorMedia = item.category === "images" || item.category === "videos" ? {
    path: item.path,
    name: item.name,
    category: item.category,
    fit: item.videoSettings?.fit ?? item.imageSettings?.fit ?? "cover",
    opacity: item.videoSettings?.opacity ?? item.imageSettings?.opacity ?? 1,
  } satisfies ProjectorMedia : null;
  const settings = item.category === "images" ? item.imageSettings : item.videoSettings;

  useEffect(() => {
    const tile = tileRef.current;
    if (!tile || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setInView(true);
        observer.disconnect();
      }
    }, { rootMargin: "240px" });
    observer.observe(tile);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView || !nativeRuntime) return;
    if (item.category === "videos" && isManagedVideo(item.path)) return;
    let active = true;
    void invoke<string>("create_media_thumbnail", { path: item.path, category: item.category })
      .then((path) => {
        if (!active) return;
        if (item.category === "images") {
          void invoke<string>("read_template_image_file", { path })
            .then((dataUrl) => { if (active) setThumbnail({ key: thumbnailKey, src: dataUrl }); })
            .catch(() => {
              if (!active) return;
              try { setThumbnail({ key: thumbnailKey, src: convertFileSrc(path) }); }
              catch { setThumbnail({ key: thumbnailKey, src: null }); }
            });
        } else {
          try { setThumbnail({ key: thumbnailKey, src: convertFileSrc(path) }); }
          catch { setThumbnail({ key: thumbnailKey, src: null }); }
        }
      })
      .catch(() => { if (active) setThumbnail({ key: thumbnailKey, src: null }); });
    return () => { active = false; };
  }, [inView, item.category, item.path, nativeRuntime, thumbnailKey]);

  const activate = () => {
    onSelect(item.path);
    if (projectorMedia) {
      if (clickAction === "preview") onPreviewMedia(projectorMedia);
      else onSendMedia(projectorMedia);
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      setAudioPlaying(false);
      return;
    }
    audio.volume = Math.min(1, Math.max(0, item.audioSettings?.volume ?? 1));
    try { audio.currentTime = item.audioSettings?.trimStart ?? 0; } catch { /* Metadata may not be loaded yet. */ }
    void audio.play().then(() => setAudioPlaying(true)).catch(() => setAudioPlaying(false));
  };

  const imageSrc = typeof snapshot === "string" ? snapshot : item.category === "images" && useFallback ? src : "";
  return (
    <div style={{ minWidth: 0 }}>
      <div
        ref={tileRef}
        role="button"
        tabIndex={0}
        aria-pressed={isSelected}
        aria-label={`${item.category === "audio" ? (audioPlaying ? "Pause" : "Play") : clickAction === "preview" ? "Preview" : "Send live"} ${item.name}`}
        title={`${item.name} · ${item.category === "audio" ? "Click to play; right-click to edit" : `Click to ${clickAction === "preview" ? "preview" : "send live"}; right-click to edit`}`}
        onClick={activate}
        onPointerEnter={() => { if (item.category === "videos" && isManagedVideo(item.path)) warmPreparedVideo(item.path); }}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); } }}
        onDoubleClick={() => { if (projectorMedia && clickAction === "preview") onSendMedia(projectorMedia); }}
        onContextMenu={(event) => onContextMenu(event, item)}
        style={{ display: "block", position: "relative", width: "100%", aspectRatio: "16 / 9", padding: 0, overflow: "hidden", border: isSelected ? "2px solid var(--color-primary)" : "1px solid var(--border-base)", borderRadius: "var(--radius-md)", background: "var(--bg-elevated)", cursor: "pointer", textAlign: "left", boxShadow: "var(--shadow-sm)" }}
      >
        {inView && imageSrc && item.category === "images" ? (
          <ResilientImage src={imageSrc} sourcePath={item.path} alt="" loading="eager" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: settings?.opacity ?? 1, filter: filtersToCss(settings?.filters), transform: flipTransform(settings?.flipX, settings?.flipY) }} />
        ) : null}
        {inView && imageSrc && item.category === "videos" ? (
          <img src={imageSrc} alt="" loading="lazy" onError={() => {
            if (managedPoster !== null) setFailedPosterPath(item.path);
            else if (typeof snapshot === "string") setThumbnail({ key: thumbnailKey, src: null });
          }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: settings?.opacity ?? 1, filter: filtersToCss(settings?.filters), transform: flipTransform(settings?.flipX, settings?.flipY) }} />
        ) : null}
        {inView && item.category === "videos" && managedPoster === null && useFallback && !videoFailed ? (
          <video src={src} muted playsInline preload="metadata" onLoadedMetadata={(event) => { const video = event.currentTarget; try { video.currentTime = Math.min(0.2, video.duration / 2); } catch { /* Keep the first frame. */ } }} onError={() => setVideoFailed(true)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: settings?.opacity ?? 1, filter: filtersToCss(settings?.filters), transform: flipTransform(settings?.flipX, settings?.flipY) }} />
        ) : null}
        {inView && posterFailed ? <span aria-hidden="true" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--fg-muted)", fontSize: 11 }}>Preview unavailable</span> : null}
        {inView && item.category === "audio" && useFallback ? (
          peaks.length > 0 ? <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: "0 10px", background: "#181322" }}><WaveformCanvas peaks={peaks} duration={duration} height={64} barColor="var(--color-primary)" progressColor="var(--color-primary)" /></div> : <span aria-hidden="true" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--fg-muted)", fontSize: 28 }}>♪</span>
        ) : null}
        {videoFailed ? <span aria-hidden="true" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--fg-muted)", fontSize: 26 }}>▣</span> : null}
        <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "16px 8px 6px", background: "linear-gradient(transparent, rgba(0,0,0,.78))", color: "#fff", fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", pointerEvents: "none" }}>{item.name}</span>
      </div>
      {item.category === "audio" ? <audio ref={audioRef} src={src} preload="none" onEnded={() => setAudioPlaying(false)} onTimeUpdate={(event) => { const end = item.audioSettings?.trimEnd; if (end != null && event.currentTarget.currentTime >= end) { event.currentTarget.pause(); setAudioPlaying(false); } }} /> : null}
    </div>
  );
});

// ─── Templates tab ────────────────────────────────────────────────────────────

type TemplateMenuAction = "edit" | "makeDefault" | "rename" | "delete" | "duplicate";

interface TemplateMenuState {
  templateId: string;
  x: number;
  y: number;
}

function templateCategoryLabel(category: TemplateFilter) {
  return category === "scriptures" ? "Scripture" : "Song";
}

function updatedLabel(timestamp: number) {
  const deltaMs = Math.max(0, Date.now() - timestamp);
  const mins = Math.floor(deltaMs / 60000);
  if (mins < 1) {
    return "Updated now";
  }
  if (mins < 60) {
    return `Updated ${mins}m ago`;
  }
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    return `Updated ${hrs}h ago`;
  }
  return `Updated ${Math.floor(hrs / 24)}d ago`;
}

const TemplateCard = memo(function TemplateCard({
  template,
  isDefault,
  onOpenEdit,
  onContextMenu,
}: {
  template: ReturnType<typeof useTemplateStore.getState>["templates"][number];
  isDefault: boolean;
  onOpenEdit: (templateId: string) => void;
  onContextMenu: (event: React.MouseEvent, templateId: string) => void;
}) {
  const scene = useMemo(() => projectionScene(template), [template]);
  const previewSlide: ProjectorSlide = {
    reference: { book: "John", chapter: 3, verse: 16 },
    text: template.category === "songs"
      ? "Amazing grace, how sweet the sound"
      : "For God so loved the world, that he gave his one and only Son.",
    version: template.category === "songs" ? "SONG" : "NIV",
  };

  return (
    <article
      onDoubleClick={() => onOpenEdit(template.id)}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu(event, template.id);
      }}
      style={{
        border: isDefault ? "1px solid var(--color-primary)" : "1px solid var(--border-base)",
        borderRadius: "10px",
        background: "var(--bg-elevated)",
        overflow: "hidden",
        boxShadow: "var(--shadow-sm)",
        cursor: "pointer",
      }}
    >
      <div style={{ aspectRatio: "16 / 9", position: "relative", overflow: "hidden", cursor: "pointer" }}>
        <TemplateSceneOverlay scene={scene} slide={previewSlide} category={template.category} fitToContainer isThumbnail />
      </div>

      <div style={{ padding: "10px", display: "grid", gap: "4px" }}>
        <span title={template.name} style={{ color: "var(--fg-base)", fontSize: "13px", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{template.name}</span>
        <div style={{ display: "flex", minHeight: "16px", alignItems: "center" }}>
          <span style={{ color: "var(--fg-base)", fontSize: "10px", fontFamily: "var(--font-mono)", fontWeight: 700, letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
            {isDefault ? "DEFAULT · " : ""}{template.layout === "lower-third" ? "LOWER THIRD" : template.layout === "split-screen" ? "SPLIT SCREEN" : "WIDESCREEN"}
          </span>
        </div>
        <span style={{ color: "var(--fg-muted)", fontSize: "11px", lineHeight: 1.35 }}>{template.subtitle}</span>
        <span style={{ color: "var(--fg-subtle)", fontSize: "10px", fontFamily: "var(--font-mono)", letterSpacing: "0.05em" }}>
          {updatedLabel(template.updatedAt)}
        </span>
      </div>
    </article>
  );
});

function TemplatesTab() {
  const [activeFilter, setActiveFilter] = useState<TemplateFilter>("scriptures");
  const [menuState, setMenuState] = useState<TemplateMenuState | null>(null);
  const [renameTemplateId, setRenameTemplateId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTemplateId, setEditorTemplateId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const initialized = useTemplateStore((s) => s.initialized);
  const loading = useTemplateStore((s) => s.loading);
  const templates = useTemplateStore((s) => s.templates);
  const defaults = useTemplateStore((s) => s.defaults);
  const initialize = useTemplateStore((s) => s.initialize);
  const makeDefault = useTemplateStore((s) => s.makeDefault);
  const renameTemplate = useTemplateStore((s) => s.renameTemplate);
  const deleteTemplate = useTemplateStore((s) => s.deleteTemplate);
  const duplicateTemplate = useTemplateStore((s) => s.duplicateTemplate);

  const visibleTemplates = useMemo(
    () => templates.filter((entry) => entry.category === activeFilter),
    [activeFilter, templates],
  );

  const menuTemplate = useMemo(
    () => (menuState ? templates.find((entry) => entry.id === menuState.templateId) ?? null : null),
    [menuState, templates],
  );

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (!menuState) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuState(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuState(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuState]);

  const openCreateModal = () => {
    setEditorMode("create");
    setEditorTemplateId(null);
    setEditorOpen(true);
    setMenuState(null);
  };

  const openEditModal = useCallback((templateId: string) => {
    setEditorMode("edit");
    setEditorTemplateId(templateId);
    setEditorOpen(true);
    setMenuState(null);
  }, []);

  const handleTemplateContextMenu = useCallback((event: React.MouseEvent, templateId: string) => {
    setMenuState({ templateId, x: event.clientX, y: event.clientY });
  }, []);

  const executeMenuAction = async (action: TemplateMenuAction) => {
    if (!menuTemplate) {
      setMenuState(null);
      return;
    }

    if (action === "edit") {
      openEditModal(menuTemplate.id);
      return;
    }

    if (action === "makeDefault") {
      await makeDefault(menuTemplate.category, menuTemplate.layout, menuTemplate.id);
      setMenuState(null);
      return;
    }

    if (action === "rename") {
      setRenameTemplateId(menuTemplate.id);
      setRenameValue(menuTemplate.name);
      setMenuState(null);
      return;
    }

    if (action === "delete") {
      setDeleteTemplateId(menuTemplate.id);
      setMenuState(null);
      return;
    }

    if (action === "duplicate") {
      await duplicateTemplate(menuTemplate.id);
      setMenuState(null);
    }
  };

  const menuLeft = menuState ? Math.min(menuState.x, window.innerWidth - 236) : 0;
  const menuTop = menuState ? Math.min(menuState.y, window.innerHeight - 250) : 0;
  const renameTargetTemplate = renameTemplateId ? templates.find((template) => template.id === renameTemplateId) : null;
  const deleteTargetTemplate = deleteTemplateId ? templates.find((template) => template.id === deleteTemplateId) : null;

  const closeRename = () => {
    setRenameTemplateId(null);
    setRenameValue("");
  };

  const confirmRename = async () => {
    const name = renameValue.trim();
    if (!renameTemplateId || !name) return;
    await renameTemplate(renameTemplateId, name);
    closeRename();
  };

  const closeDeleteConfirmation = () => setDeleteTemplateId(null);

  const confirmDelete = async () => {
    if (!deleteTemplateId) return;
    await deleteTemplate(deleteTemplateId);
    closeDeleteConfirmation();
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", position: "relative" }}>
      <div
        style={{
          width: 160,
          flexShrink: 0,
          borderRight: "1px solid var(--border-base)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {(["scriptures", "songs"] as TemplateFilter[]).map((filter) => (
          <FilterRow
            key={filter}
            label={filter === "scriptures" ? "Scriptures" : "Songs"}
            isActive={activeFilter === filter}
            onClick={() => setActiveFilter(filter)}
          />
        ))}

        <div
          style={{
            marginTop: "auto",
            padding: "10px",
            borderTop: "1px solid var(--border-base)",
            display: "flex",
            justifyContent: "flex-start",
          }}
        >
          <button
            type="button"
              onClick={openCreateModal}
            aria-label={`Add ${templateCategoryLabel(activeFilter).toLowerCase()} template`}
            title={`Add ${templateCategoryLabel(activeFilter)} template`}
            style={{
              width: "30px",
              height: "30px",
              border: "none",
              borderRadius: "8px",
              background: "var(--bg-elevated)",
              color: "var(--fg-base)",
              fontFamily: "var(--font-mono)",
              fontSize: "18px",
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            +
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "auto", padding: "14px" }}>
        {!initialized || loading ? (
          <LibraryEmptyState title="Loading templates..." />
        ) : visibleTemplates.length === 0 ? (
          <LibraryEmptyState title={`No ${templateCategoryLabel(activeFilter).toLowerCase()} templates yet`} />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "12px",
            }}
          >
            {visibleTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                isDefault={defaults[template.category][template.layout] === template.id}
                onOpenEdit={openEditModal}
                onContextMenu={handleTemplateContextMenu}
              />
            ))}
          </div>
        )}
      </div>

      {menuState && menuTemplate ? (
        <div
          ref={menuRef}
          role="menu"
          style={{
            position: "fixed",
            left: `${menuLeft}px`,
            top: `${menuTop}px`,
            width: "220px",
            background: "var(--bg-surface)",
            border: "none",
            borderRadius: "8px",
            boxShadow: "var(--shadow-lg)",
            padding: "4px",
            zIndex: 90,
          }}
        >
          {([
            { id: "edit", label: "Edit" },
            { id: "makeDefault", label: `Make default ${templateCategoryLabel(menuTemplate.category)} ${menuTemplate.layout === "lower-third" ? "Lower Third" : menuTemplate.layout === "split-screen" ? "Split screen" : "Widescreen"} theme` },
            { id: "rename", label: "Rename" },
            { id: "delete", label: "Delete" },
            { id: "duplicate", label: "Duplicate" },
          ] as Array<{ id: TemplateMenuAction; label: string }>).map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="menuitem"
              onClick={() => executeMenuAction(entry.id)}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = entry.id === "delete" ? "rgba(255, 75, 96, 0.14)" : "var(--color-primary-muted)";
              }}
              onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}
              style={{
                width: "100%",
                border: "none",
                background: "transparent",
                borderRadius: "6px",
                padding: "8px 9px",
                textAlign: "left",
                color: entry.id === "delete" ? "var(--color-error)" : "var(--fg-base)",
                fontFamily: "var(--font-sans)",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              {entry.label}
            </button>
          ))}
        </div>
      ) : null}

      {renameTargetTemplate ? createPortal(
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeRename();
          }}
          style={{ position: "fixed", inset: 0, zIndex: 100, display: "grid", placeItems: "center", padding: 20, background: "rgba(8, 9, 14, 0.58)" }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="rename-template-title" style={{ width: "min(420px, 100%)", boxSizing: "border-box", padding: 18, border: "1px solid var(--border-base)", borderRadius: 10, background: "var(--bg-surface)", boxShadow: "var(--shadow-lg)" }}>
            <h2 id="rename-template-title" style={{ margin: 0, color: "var(--fg-base)", fontSize: 16 }}>Rename template</h2>
            <p style={{ margin: "6px 0 14px", color: "var(--fg-muted)", fontSize: 12 }}>{renameTargetTemplate.name}</p>
            <input
              autoFocus
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void confirmRename();
                if (event.key === "Escape") closeRename();
              }}
              aria-label="Template name"
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 11px", border: "none", borderRadius: 6, outline: "2px solid var(--color-primary)", background: "var(--bg-base)", color: "var(--fg-base)", fontSize: 13 }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button type="button" onClick={closeRename} style={renameSecondaryButton}>Cancel</button>
              <button type="button" onClick={() => void confirmRename()} disabled={!renameValue.trim()} style={{ ...renamePrimaryButton, opacity: renameValue.trim() ? 1 : 0.5 }}>Rename</button>
            </div>
          </section>
        </div>,
        globalThis.document.body,
      ) : null}

      {deleteTargetTemplate ? createPortal(
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDeleteConfirmation();
          }}
          style={{ position: "fixed", inset: 0, zIndex: 100, display: "grid", placeItems: "center", padding: 20, background: "rgba(8, 9, 14, 0.58)" }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="delete-template-title" aria-describedby="delete-template-description" style={{ width: "min(420px, 100%)", boxSizing: "border-box", padding: 18, border: "1px solid var(--border-base)", borderRadius: 10, background: "var(--bg-surface)", boxShadow: "var(--shadow-lg)" }}>
            <h2 id="delete-template-title" style={{ margin: 0, color: "var(--fg-base)", fontSize: 16 }}>Delete template?</h2>
            <p id="delete-template-description" style={{ margin: "6px 0 14px", color: "var(--fg-muted)", fontSize: 12, lineHeight: 1.5 }}>
              Delete &ldquo;{deleteTargetTemplate.name}&rdquo;? This cannot be undone.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" autoFocus onClick={closeDeleteConfirmation} style={renameSecondaryButton}>Cancel</button>
              <button type="button" onClick={() => void confirmDelete()} style={deleteTemplateButton}>Delete</button>
            </div>
          </section>
        </div>,
        globalThis.document.body,
      ) : null}

      <TemplateEditorModal
        open={editorOpen}
        mode={editorMode}
        category={activeFilter}
        templateId={editorTemplateId}
        onClose={() => setEditorOpen(false)}
      />
    </div>
  );
}

const renameSecondaryButton = { padding: "8px 13px", border: "none", borderRadius: 6, background: "var(--bg-elevated)", color: "var(--fg-base)", cursor: "pointer", fontSize: 12 };
const renamePrimaryButton = { padding: "8px 13px", border: "none", borderRadius: 6, background: "var(--color-primary)", color: "var(--fg-on-accent)", cursor: "pointer", fontSize: 12 };
const deleteTemplateButton = { padding: "8px 13px", border: "none", borderRadius: 6, background: "var(--color-error)", color: "white", cursor: "pointer", fontSize: 12 };

function LibraryEmptyState({ title }: { title: string }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-4)",
        color: "var(--fg-subtle)",
        fontSize: "var(--text-xs)",
        fontStyle: "italic",
      }}
    >
      {title}
    </div>
  );
}

// ─── Shared FilterRow ─────────────────────────────────────────────────────────

function FilterRow({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        padding: "8px 12px",
        background: isActive ? "var(--color-primary-muted)" : hovered ? "var(--bg-elevated)" : "transparent",
        border: "none",
        borderLeft: isActive ? "2px solid var(--color-primary)" : "2px solid transparent",
        borderBottom: "1px solid var(--border-base)",
        cursor: "pointer",
        fontSize: "var(--text-xs)",
        fontFamily: "var(--font-sans)",
        color: isActive ? "var(--color-primary)" : hovered ? "var(--fg-base)" : "var(--fg-muted)",
        fontWeight: isActive ? 600 : 400,
        textAlign: "left",
        transition: "background 120ms ease, color 120ms ease",
      }}
    >
      {label}
    </button>
  );
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────

const TABS: { id: LibraryTab; label: string }[] = [
  { id: "scriptures", label: "Scriptures" },
  { id: "songs", label: "Songs" },
  { id: "media", label: "Media" },
  { id: "overlays", label: "Overlays" },
  { id: "templates", label: "Templates" },
];

// ─── Root export ──────────────────────────────────────────────────────────────

export function LocalLibraryPanel({
  activeTab,
  searchQuery,
  searchMode,
  onActiveTabChange,
  previewReference,
  liveReference,
  previewMedia,
  liveMedia,
  onPreviewSlide,
  onSendLive,
  onSelectedScriptureChange,
  onCreateCue,
  onNavigationHandlerChange,
  onPreviewMedia,
  onSendMedia,
}: LocalLibraryPanelProps) {
  const searchableProps = { previewReference, liveReference, onPreviewSlide, onSendLive, onSelectedScriptureChange, onCreateCue, searchQuery };
  const navigationHandlerFor = useCallback((tab: LibraryTab) => (handler: LibraryNavigationHandler | null) => {
    if (activeTab === tab) onNavigationHandlerChange?.(handler);
  }, [activeTab, onNavigationHandlerChange]);
  const previousTabRef = useRef(activeTab);
  const [tabDirection, setTabDirection] = useState<"forward" | "backward">("forward");
  const [templatesMounted, setTemplatesMounted] = useState(activeTab === "templates");
  const [mountedTabs, setMountedTabs] = useState<Set<LibraryTab>>(() => new Set([activeTab]));
  const [songSlideClickAction, setSongSlideClickAction] = useState<"preview" | "live">("live");
  const [mediaClickAction, setMediaClickAction] = useState<"preview" | "live">("live");

  useLayoutEffect(() => {
    const previousIndex = TABS.findIndex((tab) => tab.id === previousTabRef.current);
    const activeIndex = TABS.findIndex((tab) => tab.id === activeTab);
    setTabDirection(activeIndex >= previousIndex ? "forward" : "backward");
    previousTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setMountedTabs((current) => current.has(activeTab) ? current : new Set(current).add(activeTab));
    });
    return () => { cancelled = true; };
  }, [activeTab]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        background: "var(--bg-base)",
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          borderBottom: "1px solid var(--border-base)",
          flexShrink: 0,
          paddingLeft: "var(--space-2)",
          gap: "var(--space-1)",
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (tab.id === "templates") {
                  setTemplatesMounted(true);
                }
                setMountedTabs((current) => current.has(tab.id) ? current : new Set(current).add(tab.id));
                onActiveTabChange(tab.id);
              }}
              style={{
                padding: "7px 14px",
                background: "transparent",
                border: "none",
                borderBottom: isActive ? "2px solid var(--color-primary)" : "2px solid transparent",
                marginBottom: "-1px",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-xs)",
                fontWeight: 600,
                letterSpacing: "0.06em",
                color: isActive ? "var(--color-primary)" : "var(--fg-muted)",
                transition: "color 120ms ease, border-color 120ms ease",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--fg-base)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--fg-muted)";
                }
              }}
            >
              {tab.label.toUpperCase()}
            </button>
          );
        })}

        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            paddingRight: "var(--space-3)",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-xs)",
              letterSpacing: "0.08em",
              color: "var(--fg-subtle)",
            }}
          >
            LOCAL LIBRARY
          </span>
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {templatesMounted || activeTab === "templates" ? (
          <div style={{ display: activeTab === "templates" ? "block" : "none", height: "100%" }}>
            <TemplatesTab />
          </div>
        ) : null}
        {(["scriptures", "songs", "media", "overlays"] as const).map((tab) => {
          if (!mountedTabs.has(tab)) return null;
          const isActive = activeTab === tab;
          return (
            <div
              key={tab}
              data-library-tab={tab}
              className={isActive ? `library-tab-slide library-tab-slide--${tabDirection}` : undefined}
              style={{ display: isActive ? "block" : "none", height: "100%" }}
              aria-hidden={!isActive}
            >
              {tab === "scriptures" && <ScripturesTab {...searchableProps} isActive={isActive} searchMode={searchMode} onNavigationHandlerChange={navigationHandlerFor("scriptures")} />}
              {tab === "songs" && <SongsTab {...searchableProps} isActive={isActive} onNavigationHandlerChange={navigationHandlerFor("songs")} slideClickAction={songSlideClickAction} onSlideClickActionChange={setSongSlideClickAction} />}
              {tab === "media" && <MediaTab onPreviewMedia={onPreviewMedia} onSendMedia={onSendMedia} clickAction={mediaClickAction} onClickActionChange={setMediaClickAction} previewMedia={previewMedia} liveMedia={liveMedia} />}
              {tab === "overlays" && <OverlaysTab />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
