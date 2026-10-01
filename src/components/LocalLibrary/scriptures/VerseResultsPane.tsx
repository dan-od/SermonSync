import { referenceLabel, toProjectorSlide } from "../libraryUtils";
import { PaneEmpty, ScripturePane } from "../primitives";
import { slideActionButtonStyle } from "../styles";
import type { BibleVerse, LocalBibleEntry } from "../types";

export function VerseResultsPane({
  textSearchQuery,
  scriptureClickAction,
  setScriptureClickAction,
  displayedVerseRows,
  selectedDisplayName,
  verseRowRefs,
  handleTextClick,
  handleTextDoubleClick,
  handleTextKeyDown,
  selectedReference,
  setSelectedReference,
  liveReference,
  previewReference,
  isSearchingWholeBible,
  wholeBibleSearchError,
  isLoading,
  selectedBible,
  loadError,
}: {
  textSearchQuery: string;
  scriptureClickAction: "preview" | "live";
  setScriptureClickAction: React.Dispatch<React.SetStateAction<"preview" | "live">>;
  displayedVerseRows: { book: string; chapter: number; verse: BibleVerse }[];
  selectedDisplayName: string;
  verseRowRefs: React.RefObject<Map<number, HTMLButtonElement>>;
  handleTextClick: (book: string, chapter: number, verse: BibleVerse) => void;
  handleTextDoubleClick: (book: string, chapter: number, verse: BibleVerse) => void;
  handleTextKeyDown: (event: React.KeyboardEvent, book: string, chapter: number, verse: BibleVerse) => void;
  selectedReference: string | null;
  setSelectedReference: React.Dispatch<React.SetStateAction<string | null>>;
  liveReference: string | null;
  previewReference: string | null;
  isSearchingWholeBible: boolean;
  wholeBibleSearchError: string | null;
  isLoading: boolean;
  selectedBible: LocalBibleEntry | undefined;
  loadError: string | null;
}) {
  return (
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
  );
}
