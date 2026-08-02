import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useConfigStore } from "../stores/configStore";
import type { ProjectorSlide } from "../types/state";

// ─── Types ────────────────────────────────────────────────────────────────────

export type LibraryTab = "scriptures" | "songs" | "media" | "templates";
type TemplateFilter = "scriptures" | "songs";

interface SearchableLibraryTabProps {
  previewReference: string | null;
  liveReference: string | null;
  onPreviewSlide: (slide: ProjectorSlide) => void;
  onSendLive: (slide: ProjectorSlide) => void;
  searchQuery: string;
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
  activeTab: LibraryTab;
  searchQuery: string;
  onActiveTabChange: (tab: LibraryTab) => void;
  onPreviewSlide: (slide: ProjectorSlide) => void;
  onSendLive: (slide: ProjectorSlide) => void;
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

async function fetchBibleJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BIBLE_API_BASE}${path}`);
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
}: {
  title: string;
  children: React.ReactNode;
  width?: string;
  showDivider?: boolean;
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
      <div style={tableHeaderCellStyle()}>{title}</div>
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
  title,
  align = "left",
}: {
  children: React.ReactNode;
  isActive?: boolean;
  isPreview?: boolean;
  isLive?: boolean;
  isDisabled?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  title?: string;
  align?: "left" | "center";
}) {
  const activeColor = isLive ? "var(--color-success)" : isPreview ? "var(--color-primary)" : "var(--color-primary)";

  return (
    <button
      type="button"
      disabled={isDisabled}
      title={title}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{
        display: "block",
        width: "100%",
        minHeight: 30,
        padding: "6px 12px",
        background: isActive || isPreview || isLive ? "var(--color-primary-muted)" : "transparent",
        border: "none",
        borderLeft: isActive || isPreview || isLive ? `2px solid ${activeColor}` : "2px solid transparent",
        color: isDisabled ? "var(--fg-subtle)" : isActive || isPreview || isLive ? activeColor : "var(--fg-base)",
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

function ScripturesTab({ previewReference, liveReference, onPreviewSlide, onSendLive, searchQuery }: SearchableLibraryTabProps) {
  const [localOpen, setLocalOpen] = useState(true);
  const [apiOpen, setApiOpen] = useState(false);
  const defaultBibleVersion = useConfigStore((state) => state.bibleVersion);
  const setDefaultBibleVersion = useConfigStore((state) => state.setBibleVersion);
  const setBibleVersions = useConfigStore((state) => state.setBibleVersions);
  const bibleNameOverrides = useConfigStore((state) => state.bibleNameOverrides);
  const setBibleNameOverride = useConfigStore((state) => state.setBibleNameOverride);
  const [versions, setVersions] = useState<BibleVersionEntry[]>([]);
  const [books, setBooks] = useState<BibleBook[]>([]);
  const [bookPayload, setBookPayload] = useState<BibleBookPayload | null>(null);
  const [selectedBibleId, setSelectedBibleId] = useState<string | null>(null);
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  const [selectedVerse, setSelectedVerse] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const localBibles = useMemo(
    () =>
      versions
        .filter((version) => version.available)
        .map((version) => ({
          id: version.abbreviation.toLowerCase(),
          name: bibleNameOverrides[version.abbreviation] ?? version.name,
          abbreviation: version.abbreviation,
          available: version.available,
        })),
    [versions, bibleNameOverrides],
  );

  const selectedBible = useMemo(
    () => localBibles.find((bible) => bible.id === selectedBibleId) ?? localBibles.find((bible) => bible.available) ?? localBibles[0],
    [localBibles, selectedBibleId],
  );
  const selectedVersion = selectedBible?.abbreviation ?? defaultBibleVersion;
  const activeBookPayload = selectedBook && selectedBible?.available ? bookPayload : null;
  const selectedChapterData = activeBookPayload?.chapters.find((chapter) => chapter.number === selectedChapter) ?? null;
  const selectedVerseData = selectedChapterData?.verses.find((verse) => verse.verse === selectedVerse) ?? null;
  const normalizedSearchQuery = normalizeSearch(searchQuery);
  const filteredBooks = useMemo(() => {
    if (!normalizedSearchQuery) {
      return books;
    }

    return books.filter((entry) =>
      `${entry.name} ${entry.abbreviation} ${entry.testament}`.toLowerCase().includes(normalizedSearchQuery),
    );
  }, [books, normalizedSearchQuery]);
  const displayedVerseRows = useMemo(() => {
    if (!activeBookPayload) {
      return [];
    }

    if (normalizedSearchQuery) {
      return activeBookPayload.chapters.flatMap((chapter) =>
        chapter.verses
          .filter((verse) =>
            `${activeBookPayload.book.name} ${activeBookPayload.book.abbreviation} ${chapter.number}:${verse.verse} ${verse.text}`
              .toLowerCase()
              .includes(normalizedSearchQuery),
          )
          .map((verse) => ({ chapter: chapter.number, verse })),
      );
    }

    const verses = selectedVerseData ? [selectedVerseData] : selectedChapterData?.verses ?? [];
    return verses.map((verse) => ({ chapter: selectedChapter ?? selectedChapterData?.number ?? 1, verse }));
  }, [activeBookPayload, normalizedSearchQuery, selectedChapter, selectedChapterData?.number, selectedChapterData?.verses, selectedVerseData]);

  const loadCatalog = useCallback(
    async (preferredVersion?: string) => {
      setIsLoading(true);
      setLoadError(null);

      try {
        const versionData = await fetchBibleJson<{ versions: BibleVersionEntry[] }>("/api/bible/versions");
        setVersions(versionData.versions);
        setBibleVersions(versionData.versions);

        const requestedVersion = preferredVersion?.trim().toLowerCase();
        const availableDefault =
          versionData.versions.find((version) => version.abbreviation.toLowerCase() === requestedVersion && version.available) ??
          versionData.versions.find((version) => version.abbreviation.toLowerCase() === defaultBibleVersion.toLowerCase() && version.available) ??
          versionData.versions.find((version) => version.available);

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
        setSelectedChapter(payload.chapters[0]?.number ?? null);
        setSelectedVerse(null);
      } catch {
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

  const handleTextClick = (chapter: number, verse: BibleVerse) => {
    onPreviewSlide(toProjectorSlide(selectedBook ?? bookPayload?.book.name ?? "", chapter, verse, selectedVersion));
  };

  const handleTextDoubleClick = (chapter: number, verse: BibleVerse) => {
    onSendLive(toProjectorSlide(selectedBook ?? bookPayload?.book.name ?? "", chapter, verse, selectedVersion));
  };

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
            label="+ Local Bibles"
            isOpen={localOpen}
            onToggle={() => setLocalOpen((v) => !v)}
          >
            {localBibles.map((bible) => (
              <BibleItem
                key={bible.id}
                bible={bible}
                isSelected={selectedBibleId === bible.id}
                onSelect={() => selectBible(bible)}
                onRename={(newName) => setBibleNameOverride(bible.abbreviation, newName)}
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
            label="+ API Bibles"
            isOpen={apiOpen}
            onToggle={() => setApiOpen((v) => !v)}
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
            borderTop: "1px solid var(--border-base)",
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
              border: "1px solid var(--color-primary)",
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
          {activeBookPayload?.chapters.map((chapter) => (
            <ScriptureCellButton
              key={chapter.number}
              align="center"
              isActive={selectedChapter === chapter.number}
              onClick={() => {
                setSelectedChapter(chapter.number);
                setSelectedVerse(null);
              }}
            >
              {chapter.number}
            </ScriptureCellButton>
          ))}
          {!activeBookPayload && <PaneEmpty>{selectedBible?.available === false ? "Unavailable" : "Select a book"}</PaneEmpty>}
        </ScripturePane>

        <ScripturePane title="Verse">
          {displayedVerseRows.map(({ chapter, verse }) => {
            const slide = toProjectorSlide(selectedBook ?? bookPayload?.book.name ?? "", chapter, verse, selectedVersion);
            const label = referenceLabel(slide);

            return (
              <button
                key={`${chapter}-${verse.verse}`}
                type="button"
                onClick={() => handleTextClick(chapter, verse)}
                onDoubleClick={() => handleTextDoubleClick(chapter, verse)}
                style={{
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: "56px minmax(0, 1fr)",
                  gap: "var(--space-2)",
                  padding: "8px 12px",
                  background: liveReference === label || previewReference === label ? "var(--color-primary-muted)" : "transparent",
                  border: "none",
                  borderLeft:
                    liveReference === label
                      ? "2px solid var(--color-success)"
                      : previewReference === label
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
                    color: liveReference === label ? "var(--color-success)" : "var(--color-primary)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-xs)",
                    fontWeight: 700,
                  }}
                >
                  {chapter}:{verse.verse}
                </span>
                <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)", lineHeight: 1.45 }}>
                  {verse.text}
                </span>
              </button>
            );
          })}
          {displayedVerseRows.length === 0 && (
            <PaneEmpty>
              {isLoading
                ? "Loading scriptures..."
                : normalizedSearchQuery && activeBookPayload
                  ? "No matching verses in this book"
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
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
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
          borderBottom: "1px solid var(--border-base)",
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
            borderBottom: "1px solid var(--border-base)",
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
  onRename,
}: {
  bible: LocalBibleEntry;
  isSelected: boolean;
  onSelect: () => void;
  onRename: (newName: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(bible.name);
  const [isHovered, setIsHovered] = useState(false);
  const isDisabled = !bible.available;

  const commitRename = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== bible.name) {
      onRename(trimmed);
    } else {
      setEditValue(bible.name);
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          width: "100%",
          padding: "5px 8px 5px 24px",
          background: "var(--color-primary-muted)",
          borderLeft: "2px solid var(--color-primary)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.65rem",
            fontWeight: 700,
            letterSpacing: "0.04em",
            background: "var(--color-primary)",
            color: "#fff",
            padding: "1px 4px",
            borderRadius: "var(--radius-sm)",
            flexShrink: 0,
          }}
        >
          {bible.abbreviation}
        </span>
        <input
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") {
              setEditValue(bible.name);
              setIsEditing(false);
            }
          }}
          style={{
            flex: 1,
            minWidth: 0,
            background: "var(--bg-base)",
            color: "var(--fg-base)",
            border: "1px solid var(--color-primary)",
            borderRadius: "var(--radius-sm)",
            padding: "2px 6px",
            fontSize: "var(--text-xs)",
            outline: "none",
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        type="button"
        disabled={isDisabled}
        onClick={onSelect}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          width: "100%",
          padding: "5px 28px 5px 24px",
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
            fontFamily: "var(--font-mono)",
            fontSize: "0.65rem",
            fontWeight: 700,
            letterSpacing: "0.04em",
            background: isSelected ? "var(--color-primary)" : "var(--bg-elevated)",
            color: isSelected ? "#fff" : "var(--fg-subtle)",
            padding: "1px 4px",
            borderRadius: "var(--radius-sm)",
          }}
        >
          {bible.abbreviation}
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {bible.name}
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
      {isHovered && !isDisabled && (
        <button
          type="button"
          title="Rename"
          onClick={(e) => {
            e.stopPropagation();
            setEditValue(bible.name);
            setIsEditing(true);
          }}
          style={{
            position: "absolute",
            right: 4,
            top: "50%",
            transform: "translateY(-50%)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "2px 3px",
            color: "var(--fg-subtle)",
            fontSize: "0.65rem",
            lineHeight: 1,
          }}
        >
          ✎
        </button>
      )}
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
          background: "rgba(0,0,0,0.55)",
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
              border: "1px solid rgba(239, 68, 68, 0.4)",
              background: "rgba(239, 68, 68, 0.1)",
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

interface SongSlide {
  label: string;
  text: string;
}

interface Song {
  id: string;
  title: string;
  artist: string;
  slides: SongSlide[];
}

const MOCK_SONGS: Song[] = [
  {
    id: "song-1",
    title: "Amazing Grace",
    artist: "John Newton",
    slides: [
      { label: "Verse 1", text: "Amazing grace! How sweet the sound, That saved a wretch like me! I once was lost, but now am found, Was blind, but now I see." },
      { label: "Verse 2", text: "'Twas grace that taught my heart to fear, And grace my fears relieved; How precious did that grace appear The hour I first believed!" },
      { label: "Verse 3", text: "Through many dangers, toils and snares, I have already come; 'Tis grace hath brought me safe thus far, And grace will lead me home." },
      { label: "Verse 4", text: "When we've been there ten thousand years, Bright shining as the sun, We've no less days to sing God's praise Than when we'd first begun." },
    ],
  },
  {
    id: "song-2",
    title: "How Great Is Our God",
    artist: "Chris Tomlin",
    slides: [
      { label: "Verse 1", text: "The splendor of the King, clothed in majesty; Let all the earth rejoice, all the earth rejoice. He wraps Himself in light, and darkness tries to hide, And trembles at His voice, and trembles at His voice." },
      { label: "Chorus", text: "How great is our God! Sing with me: How great is our God! And all will see how great, how great is our God!" },
      { label: "Verse 2", text: "And age to age He stands, and time is in His hands; Beginning and the End, Beginning and the End. The Godhead, three in one, Father, Spirit, Son, The Lion and the Lamb, the Lion and the Lamb." },
      { label: "Bridge", text: "Name above all names, worthy of all praise. My heart will sing: How great is our God!" },
    ],
  },
  {
    id: "song-3",
    title: "10,000 Reasons",
    artist: "Matt Redman",
    slides: [
      { label: "Chorus", text: "Bless the Lord, O my soul, O my soul, Worship His holy name. Sing like never before, O my soul, I'll worship Your holy name." },
      { label: "Verse 1", text: "The sun comes up, it's a new day dawning, It's time to sing Your song again. Whatever may pass, and whatever lies before me, Let me be singing when the evening comes." },
      { label: "Verse 2", text: "You're rich in love, and You're slow to anger. Your name is great, and Your heart is kind. For all Your goodness, I will keep on singing, Ten thousand reasons for my heart to find." },
      { label: "Verse 3", text: "And on that day when my strength is failing, The end draws near, and my time has come; Still my soul will sing Your praise unending, Ten thousand years and then forevermore." },
    ],
  },
  {
    id: "song-4",
    title: "What A Beautiful Name",
    artist: "Hillsong Worship",
    slides: [
      { label: "Verse 1", text: "You were at the Word at the beginning, One with God the Lord Most High. Your hidden glory in creation, Now revealed in You our Christ." },
      { label: "Chorus 1", text: "What a beautiful Name it is, What a beautiful Name it is, The Name of Jesus Christ my King. What a beautiful Name it is, nothing compares to this. What a beautiful Name it is, the Name of Jesus." },
      { label: "Verse 2", text: "You didn't want heaven without us, So Jesus, You brought heaven down. My sin was great, Your love was greater; What could separate us now?" },
      { label: "Chorus 2", text: "What a wonderful Name it is, What a wonderful Name it is, The Name of Jesus Christ my King. What a wonderful Name it is, nothing compares to this. What a wonderful Name it is, the Name of Jesus." },
    ],
  },
  {
    id: "song-5",
    title: "In Christ Alone",
    artist: "Keith Getty",
    slides: [
      { label: "Verse 1", text: "In Christ alone my hope is found, He is my light, my strength, my song; This Cornerstone, this solid Ground, Firm through the fiercest drought and storm." },
      { label: "Verse 2", text: "What heights of love, what depths of peace, When fears are stilled, when strivings cease! My Comforter, my All in All, Here in the love of Christ I stand." },
      { label: "Verse 3", text: "In Christ alone! Who took on flesh, Fullness of God in helpless babe. This gift of love and righteousness, Scorned by the ones He came to save." },
      { label: "Verse 4", text: "Till on that cross as Jesus died, The wrath of God was satisfied; For every sin on Him was laid; Here in the death of Christ I live." },
    ],
  },
];

function SlideThumbnail({
  slide,
  label,
  isPreview,
  isLive,
  onClick,
  onDoubleClick,
}: {
  slide: ProjectorSlide;
  label: string;
  isPreview: boolean;
  isLive: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}) {
  const activeColor = isLive
    ? "var(--color-success)"
    : isPreview
    ? "var(--color-primary)"
    : "transparent";

  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        textAlign: "left",
        width: "100%",
        aspectRatio: "16 / 9",
        padding: "var(--space-2)",
        background: "linear-gradient(180deg, rgba(16, 20, 44, 0.95), rgba(8, 9, 18, 1))",
        border: isLive || isPreview
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
        if (!isPreview && !isLive) {
          e.currentTarget.style.borderColor = "var(--fg-subtle)";
        }
        e.currentTarget.style.transform = "scale(1.02)";
      }}
      onMouseLeave={(e) => {
        if (!isPreview && !isLive) {
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
          color: isLive ? "var(--color-success)" : isPreview ? "var(--color-primary)" : "var(--fg-muted)",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>

      {/* Slide text preview */}
      <span
        style={{
          color: "var(--fg-base)",
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
      {isLive && (
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

function SongsTab({ previewReference, liveReference, onPreviewSlide, onSendLive, searchQuery }: SearchableLibraryTabProps) {
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [slidesWidth, setSlidesWidth] = useState<number>(450);

  const gridRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ mouseX: 0, slidesWidth: 0 });

  const normalizedSearchQuery = normalizeSearch(searchQuery);

  // Filter songs based on selected artist and the shared library search.
  const filteredSongs = useMemo(() => {
    return MOCK_SONGS.filter((song) => {
      const matchesArtist = selectedArtist ? song.artist === selectedArtist : true;
      if (!matchesArtist) {
        return false;
      }

      if (!normalizedSearchQuery) {
        return true;
      }

      return `${song.title} ${song.artist} ${song.slides.map((slide) => `${slide.label} ${slide.text}`).join(" ")}`
        .toLowerCase()
        .includes(normalizedSearchQuery);
    });
  }, [normalizedSearchQuery, selectedArtist]);

  // Find currently selected song
  const selectedSong = useMemo(() => {
    return MOCK_SONGS.find((song) => song.id === selectedSongId) ?? null;
  }, [selectedSongId]);

  // Unique list of artists for Column 2
  const artists = useMemo(() => {
    const source = normalizedSearchQuery ? filteredSongs : MOCK_SONGS;
    const unique = new Set(source.map((song) => song.artist));
    return Array.from(unique);
  }, [filteredSongs, normalizedSearchQuery]);

  const handleSongSelect = (songId: string) => {
    setSelectedSongId(songId);
  };

  const handleArtistSelect = (artist: string) => {
    if (selectedArtist === artist) {
      setSelectedArtist(null);
    } else {
      setSelectedArtist(artist);
    }
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
      version: "Lyrics",
    };
  };

  return (
    <div
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
          gridTemplateColumns: `minmax(0, 1.2fr) max-content auto ${slidesWidth}px`,
          gridTemplateRows: "100%",
          overflow: "hidden",
          borderRight: "1px solid var(--border-base)",
        }}
      >
        {/* Column 1: Song Title */}
        <ScripturePane title="Song Title" showDivider={false}>
          {filteredSongs.map((song) => {
            const isSongActive = selectedSongId === song.id;
            return (
              <ScriptureCellButton
                key={song.id}
                isActive={isSongActive}
                onClick={() => handleSongSelect(song.id)}
              >
                {song.title}
              </ScriptureCellButton>
            );
          })}
          {filteredSongs.length === 0 && <PaneEmpty>{normalizedSearchQuery ? "No matching songs" : "No songs available"}</PaneEmpty>}
        </ScripturePane>

        {/* Column 2: Artiste */}
        <ScripturePane title="Artiste" showDivider={false}>
          {selectedArtist && (
            <ScriptureCellButton
              isActive={false}
              onClick={() => setSelectedArtist(null)}
            >
              <span style={{ fontStyle: "italic", opacity: 0.8 }}>Clear Filter (All Artistes)</span>
            </ScriptureCellButton>
          )}
          {artists.map((artist) => {
            const isArtistActive = selectedArtist === artist || (!selectedArtist && selectedSong?.artist === artist);
            return (
              <ScriptureCellButton
                key={artist}
                isActive={isArtistActive}
                onClick={() => handleArtistSelect(artist)}
              >
                {artist}
              </ScriptureCellButton>
            );
          })}
        </ScripturePane>

        {/* Column 3: Draggable Demarcation Line */}
        <div
          onMouseDown={handleDividerMouseDown}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize column"
          style={{
            gridColumn: "3",
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

        {/* Column 4: Slides (2x2 Grid) */}
        <ScripturePane title="Slides (2x2 Grid)">
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
                {/* 2x2 Grid */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: "var(--space-3)",
                  }}
                >
                  {selectedSong.slides.map((slide, index) => {
                    const projSlide = toSongProjectorSlide(selectedSong, slide, index);
                    const label = `${projSlide.reference.book} ${projSlide.reference.chapter}:${projSlide.reference.verse}`;
                    const isPreview = previewReference === label;
                    const isLive = liveReference === label;

                    return (
                      <SlideThumbnail
                        key={index}
                        slide={projSlide}
                        label={slide.label}
                        isPreview={isPreview}
                        isLive={isLive}
                        onClick={() => onPreviewSlide(projSlide)}
                        onDoubleClick={() => onSendLive(projSlide)}
                      />
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
    </div>
  );
}

// ─── Media tab ────────────────────────────────────────────────────────────────

function MediaTab() {
  return <LibraryEmptyState title="No media available" />;
}

// ─── Templates tab ────────────────────────────────────────────────────────────

function TemplatesTab() {
  const [activeFilter, setActiveFilter] = useState<TemplateFilter>("scriptures");

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
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
      </div>
      <LibraryEmptyState title="No templates available" />
    </div>
  );
}

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
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        padding: "8px 12px",
        background: isActive ? "var(--color-primary-muted)" : "transparent",
        border: "none",
        borderLeft: isActive ? "2px solid var(--color-primary)" : "2px solid transparent",
        borderBottom: "1px solid var(--border-base)",
        cursor: "pointer",
        fontSize: "var(--text-xs)",
        fontFamily: "var(--font-sans)",
        color: isActive ? "var(--color-primary)" : "var(--fg-muted)",
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
  { id: "templates", label: "Templates" },
];

// ─── Root export ──────────────────────────────────────────────────────────────

export function LocalLibraryPanel({
  activeTab,
  searchQuery,
  onActiveTabChange,
  previewReference,
  liveReference,
  onPreviewSlide,
  onSendLive,
}: LocalLibraryPanelProps) {
  const searchableProps = { previewReference, liveReference, onPreviewSlide, onSendLive, searchQuery };

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
              onClick={() => onActiveTabChange(tab.id)}
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
        {activeTab === "scriptures" && <ScripturesTab {...searchableProps} />}
        {activeTab === "songs" && <SongsTab {...searchableProps} />}
        {activeTab === "media" && <MediaTab />}
        {activeTab === "templates" && <TemplatesTab />}
      </div>
    </div>
  );
}
