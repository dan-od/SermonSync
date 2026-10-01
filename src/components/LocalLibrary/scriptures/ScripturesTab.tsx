import { useCallback, useEffect, useState } from "react";

import { referenceLabel, toProjectorSlide } from "../libraryUtils";
import { PaneEmpty, ScriptureCellButton, ScripturePane } from "../primitives";
import type { BibleVerse, ScriptureSearchMode, SearchableLibraryTabProps } from "../types";
import { AddScriptureModal } from "./AddScriptureModal";
import { BibleSidebar } from "./BibleSidebar";
import { useBibleCatalog } from "./useBibleCatalog";
import { useBibleImport } from "./useBibleImport";
import { VerseResultsPane } from "./VerseResultsPane";

export function ScripturesTab({
  previewReference,
  liveReference,
  onPreviewSlide,
  onSendLive,
  searchQuery,
  searchMode,
  onNavigationHandlerChange,
}: SearchableLibraryTabProps & { searchMode: ScriptureSearchMode }) {
  const [localOpen, setLocalOpen] = useState(true);
  const [apiOpen, setApiOpen] = useState(false);
  const [selectedReference, setSelectedReference] = useState<string | null>(null);
  const [scriptureClickAction, setScriptureClickAction] = useState<"preview" | "live">("live");
  const {
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
  } = useBibleCatalog({ searchQuery, searchMode });
  const { addModalOpen, setAddModalOpen, isImporting, importError, importBibleFile } = useBibleImport(loadCatalog);

  const handleTextClick = (book: string, chapter: number, verse: BibleVerse) => {
    const slide = toProjectorSlide(book, chapter, verse, selectedDisplayName);
    setSelectedReference(referenceLabel(slide));
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
    onSendLive(slide);
  };

  const handleTextKeyDown = (event: React.KeyboardEvent, book: string, chapter: number, verse: BibleVerse) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    const slide = toProjectorSlide(book, chapter, verse, selectedDisplayName);
    setSelectedReference(referenceLabel(slide));
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
      <BibleSidebar
        localOpen={localOpen}
        setLocalOpen={setLocalOpen}
        apiOpen={apiOpen}
        setApiOpen={setApiOpen}
        localBibles={localBibles}
        selectedBibleId={selectedBibleId}
        selectBible={selectBible}
        setAddModalOpen={setAddModalOpen}
      />

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

        <VerseResultsPane
          textSearchQuery={textSearchQuery}
          scriptureClickAction={scriptureClickAction}
          setScriptureClickAction={setScriptureClickAction}
          displayedVerseRows={displayedVerseRows}
          selectedDisplayName={selectedDisplayName}
          verseRowRefs={verseRowRefs}
          handleTextClick={handleTextClick}
          handleTextDoubleClick={handleTextDoubleClick}
          handleTextKeyDown={handleTextKeyDown}
          selectedReference={selectedReference}
          setSelectedReference={setSelectedReference}
          liveReference={liveReference}
          previewReference={previewReference}
          isSearchingWholeBible={isSearchingWholeBible}
          wholeBibleSearchError={wholeBibleSearchError}
          isLoading={isLoading}
          selectedBible={selectedBible}
          loadError={loadError}
        />
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
