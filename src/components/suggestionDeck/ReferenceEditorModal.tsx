import { useEffect, useMemo, useState } from "react";

import { lookupScriptureVerse } from "../../lib/sidecarClient";
import { useConfigStore } from "../../stores/configStore";
import type { ProjectorSlide, SuggestionCard } from "../../types/state";
import { referenceLabel } from "./suggestionDeckUtils";

export function ReferenceEditorModal({
  card,
  onClose,
  onSendLive,
}: {
  card: SuggestionCard;
  onClose: () => void;
  onSendLive: (slide: ProjectorSlide) => void;
}) {
  const configuredVersions = useConfigStore((state) => state.bibleVersions);
  const [book, setBook] = useState(card.reference.book);
  const [chapter, setChapter] = useState(String(card.reference.chapter));
  const [verse, setVerse] = useState(String(card.reference.verse));
  const [version, setVersion] = useState(card.version);
  const [preview, setPreview] = useState<ProjectorSlide | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const versions = useMemo(() => {
    const available = configuredVersions.filter((entry) => entry.available);
    return available.some((entry) => entry.abbreviation === card.version)
      ? available
      : [{ abbreviation: card.version, name: card.version, verse_count: 0, available: true }, ...available];
  }, [card.version, configuredVersions]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      const chapterNumber = Number.parseInt(chapter, 10);
      const verseNumber = Number.parseInt(verse, 10);
      const normalizedBook = book.trim();
      if (!normalizedBook || chapterNumber < 1 || verseNumber < 1) {
        if (!active) return;
        setPreview(null);
        setError("Enter a book, chapter, and verse.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      const result = await lookupScriptureVerse(normalizedBook, chapterNumber, verseNumber, version);
      if (!active) return;
      if (!result) {
        setPreview(null);
        setError("This reference is not available in the selected version.");
        setIsLoading(false);
        return;
      }
      setPreview({
        reference: { book: result.book, chapter: result.chapter, verse: result.verse },
        text: result.text,
        version: result.version,
      });
      setIsLoading(false);
    });

    return () => {
      active = false;
    };
  }, [book, chapter, verse, version]);

  const inputStyle: React.CSSProperties = {
    boxSizing: "border-box",
    width: "100%",
    minWidth: 0,
    border: "1px solid var(--border-base)",
    borderRadius: "var(--radius-sm)",
    background: "var(--bg-base)",
    color: "var(--fg-base)",
    padding: "8px 9px",
    fontSize: "var(--text-xs)",
    fontFamily: "var(--font-sans)",
  };

  return (
    <div
      role="presentation"
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        padding: "var(--space-4)",
        background: "rgba(0, 0, 0, 0.6)",
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-reference-title"
        onMouseDown={(event) => event.stopPropagation()}
        style={{
          width: "min(100%, 560px)",
          maxHeight: "min(640px, calc(100vh - 32px))",
          overflow: "auto",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border-base)" }}>
          <div>
            <div id="edit-reference-title" style={{ color: "var(--fg-base)", fontWeight: 700, fontSize: "var(--text-sm)" }}>Edit Reference</div>
            <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)", marginTop: 2 }}>Correct the match before sending it live.</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close editor" title="Close" style={{ border: "none", background: "transparent", color: "var(--fg-muted)", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: "grid", gap: "var(--space-3)", padding: "16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 84px 84px", gap: "var(--space-2)" }}>
            <label style={{ display: "grid", gap: 5, color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>Book<input autoFocus value={book} onChange={(event) => setBook(event.target.value)} style={inputStyle} /></label>
            <label style={{ display: "grid", gap: 5, color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>Chapter<input type="number" min="1" value={chapter} onChange={(event) => setChapter(event.target.value)} style={inputStyle} /></label>
            <label style={{ display: "grid", gap: 5, color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>Verse<input type="number" min="1" value={verse} onChange={(event) => setVerse(event.target.value)} style={inputStyle} /></label>
          </div>
          <label style={{ display: "grid", gap: 5, color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
            Version
            <select value={version} onChange={(event) => setVersion(event.target.value)} style={inputStyle}>
              {versions.map((entry) => <option key={entry.abbreviation} value={entry.abbreviation}>{entry.abbreviation} - {entry.name}</option>)}
            </select>
          </label>
          <div style={{ border: "1px solid var(--border-base)", borderRadius: "var(--radius-sm)", background: "var(--bg-base)", padding: "12px", minHeight: 104 }}>
            <div style={{ color: "var(--color-primary)", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", marginBottom: 7 }}>VERSE PREVIEW</div>
            {isLoading ? <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>Loading verse...</div> : error ? <div style={{ color: "var(--color-error)", fontSize: "var(--text-xs)" }}>{error}</div> : preview && <><div style={{ color: "var(--fg-base)", fontFamily: "Georgia, serif", fontSize: "var(--text-sm)", lineHeight: 1.5 }}>{preview.text}</div><div style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)", marginTop: 8 }}>{referenceLabel({ ...card, ...preview })} - {preview.version}</div></>}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
            <button type="button" onClick={onClose} style={{ border: "1px solid var(--border-base)", borderRadius: "var(--radius-sm)", background: "transparent", color: "var(--fg-base)", padding: "8px 12px", cursor: "pointer", fontSize: "var(--text-xs)" }}>Cancel</button>
            <button type="button" disabled={!preview || isLoading} onClick={() => preview && onSendLive(preview)} style={{ border: "1px solid var(--color-primary)", borderRadius: "var(--radius-sm)", background: preview && !isLoading ? "var(--color-primary)" : "var(--bg-elevated)", color: preview && !isLoading ? "#fff" : "var(--fg-subtle)", padding: "8px 12px", cursor: preview && !isLoading ? "pointer" : "not-allowed", fontSize: "var(--text-xs)", fontWeight: 700 }}>Send Corrected Verse Live</button>
          </div>
        </div>
      </section>
    </div>
  );
}
