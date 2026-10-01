import { useEffect, useMemo, useRef, useState } from "react";

import type { IncrementalReferenceMatch } from "../../../lib/scriptureSearch";
import { fetchBibleJson } from "../libraryUtils";
import type { BibleBook, BibleBookPayload, BibleChapter, BibleVerse, LocalBibleEntry } from "../types";

/** Whole-Bible free-text search plus the Book/Chapter/Verse pane filtering derived from it. */
export function useWholeBibleSearch({
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
}: {
  searchQuery: string;
  textSearchQuery: string;
  books: BibleBook[];
  resolvedSearchReference: IncrementalReferenceMatch | null;
  activeBookPayload: BibleBookPayload | null;
  selectedBook: string | null;
  selectedChapter: number | null;
  selectedChapterData: BibleChapter | null;
  selectedVerseData: BibleVerse | null;
  selectedVerse: number | null;
  selectedVersion: string;
  selectedBible: LocalBibleEntry | undefined;
}) {
  const verseRowRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

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

  return {
    verseRowRefs,
    filteredBooks,
    filteredChapterNumbers,
    isSearchingWholeBible,
    wholeBibleSearchError,
    displayedVerseRows,
  };
}
