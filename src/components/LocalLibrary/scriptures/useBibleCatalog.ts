import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { matchScriptureReferenceIncremental } from "../../../lib/scriptureSearch";
import { setActiveBibleVersion } from "../../../lib/sidecarClient";
import { useConfigStore } from "../../../stores/configStore";
import { fetchBibleJson, normalizeSearch } from "../libraryUtils";
import type { BibleBook, BibleBookPayload, BibleVersionEntry, LocalBibleEntry, ScriptureSearchMode } from "../types";
import { useWholeBibleSearch } from "./useWholeBibleSearch";

/** Bible versions/books/chapters/verses loaded from the sidecar, plus the current selection within them. */
export function useBibleCatalog({ searchQuery, searchMode }: { searchQuery: string; searchMode: ScriptureSearchMode }) {
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
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Chapter/verse a reference search resolved to, applied once the matching book's
  // payload finishes loading — otherwise loadBook's "default to chapter 1" reset wins the race.
  const pendingReferenceRef = useRef<{ book: string; chapter: number; verse: number | null } | null>(null);

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

  const {
    verseRowRefs,
    filteredBooks,
    filteredChapterNumbers,
    isSearchingWholeBible,
    wholeBibleSearchError,
    displayedVerseRows,
  } = useWholeBibleSearch({
    searchQuery,
    textSearchQuery,
    books,
    resolvedSearchReference,
    activeBookPayload,
    selectedBook,
    selectedChapter,
    selectedChapterData,
    selectedVerseData,
    selectedVerse,
    selectedVersion,
    selectedBible,
  });

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

  return {
    localBibles,
    selectedBibleId,
    selectBible,
    books,
    filteredBooks,
    selectedBook,
    setSelectedBook,
    selectedChapter,
    setSelectedChapter,
    setSelectedVerse,
    filteredChapterNumbers,
    textSearchQuery,
    activeBookPayload,
    selectedBible,
    selectedDisplayName,
    selectedChapterData,
    displayedVerseRows,
    verseRowRefs,
    isSearchingWholeBible,
    wholeBibleSearchError,
    isLoading,
    loadError,
    loadCatalog,
  };
}
