import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { matchScriptureReferenceIncremental } from "../../../lib/scriptureSearch";
import { setActiveBibleVersion } from "../../../lib/sidecarClient";
import { useConfigStore } from "../../../stores/configStore";
import type { BibleBook, BibleBookPayload, BibleImportResult, BibleVerse, BibleVersionEntry, LocalBibleEntry, ScriptureSearchMode, SearchableLibraryTabProps } from "../types";
import { slideActionButtonStyle } from "../styles";
import { PaneEmpty } from "../shared";
import { isTauriRuntime, normalizeSearch } from "../utils";
import { fetchBibleJson, referenceLabel, toProjectorSlide } from "./bibleApi";
import { ScriptureCellButton, ScripturePane } from "./ScripturePane";
import { AccordionGroup, BibleItem } from "./AccordionGroup";
import { AddScriptureModal } from "./AddScriptureModal";

export function ScripturesTab({
  previewReference,
  liveReference,
  onPreviewSlide,
  onSendLive,
  searchQuery,
  searchMode,
  onNavigationHandlerChange,
  onSelectedScriptureChange,
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
        }))
        .sort((a, b) => (a.name || a.abbreviation).localeCompare(b.name || b.abbreviation, undefined, { sensitivity: "base" })),
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
    onNavigationHandlerChange?.(navigateVerses);
    return () => onNavigationHandlerChange?.(null);
  }, [navigateVerses, onNavigationHandlerChange]);

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
            title="Add scripture"
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
              <div key={`${book}-${chapter}-${verse.verse}`} style={{ position: "relative" }}>
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
                onFocus={() => setSelectedReference(label)}
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
