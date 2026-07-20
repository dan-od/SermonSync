import { useMemo, useState } from "react";

import type { ProjectorSlide } from "../types/state";
import type { BiblePassage } from "./desktop/uiTypes";
import { ScrollArea } from "./ui/ScrollArea";

function referenceLabel(slide: ProjectorSlide) {
  return `${slide.reference.book} ${slide.reference.chapter}:${slide.reference.verse}`;
}

interface BiblePanelProps {
  passages: BiblePassage[];
  activeReference: string | null;
  onPreviewSlide: (slide: ProjectorSlide) => void;
}

export function BiblePanel({ passages, activeReference, onPreviewSlide }: BiblePanelProps) {
  const [searchText, setSearchText] = useState("");
  const [book, setBook] = useState(passages[0]?.reference.book ?? "");

  const books = useMemo(() => Array.from(new Set(passages.map((passage) => passage.reference.book))), [passages]);

  const filtered = useMemo(() => {
    const normalized = searchText.trim().toLowerCase();
    return passages.filter((passage) => {
      const matchesBook = book ? passage.reference.book === book : true;
      if (!normalized) {
        return matchesBook;
      }
      return `${referenceLabel(passage)} ${passage.searchText}`.toLowerCase().includes(normalized);
    });
  }, [book, passages, searchText]);

  const featured = filtered[0] ?? null;

  return (
    <div style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-xs)",
            letterSpacing: "0.08em",
            color: "var(--color-primary)",
          }}
        >
          OFFLINE BIBLE NAVIGATOR
        </div>
        <div style={{ color: "var(--fg-subtle)", fontSize: "var(--text-sm)" }}>
          Search and browse the archive scripture catalog locally
        </div>
      </div>

      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <input
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="Search by verse text, theme, or reference"
          style={{
            flex: 1,
            minWidth: 0,
            background: "var(--bg-base)",
            color: "var(--fg-base)",
            border: "1px solid var(--border-base)",
            borderRadius: "var(--radius-md)",
            padding: "10px 12px",
            fontSize: "var(--text-sm)",
          }}
        />
        <select
          value={book}
          onChange={(event) => setBook(event.target.value)}
          style={{
            background: "var(--bg-base)",
            color: "var(--fg-base)",
            border: "1px solid var(--border-base)",
            borderRadius: "var(--radius-md)",
            padding: "10px 12px",
          }}
        >
          {books.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: "var(--space-4)" }}>
        <ScrollArea
          style={{
            minHeight: 0,
          }}
          contentStyle={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
            paddingBottom: "var(--space-2)",
          }}
        >
          {filtered.map((passage) => {
            const label = referenceLabel(passage);
            const active = activeReference === label;

            return (
              <button
                key={label}
                type="button"
                onClick={() => onPreviewSlide(passage)}
                style={{
                  textAlign: "left",
                  background: active ? "var(--color-primary-muted)" : "var(--bg-surface)",
                  color: "var(--fg-base)",
                  border: `1px solid ${active ? "var(--color-primary)" : "var(--border-base)"}`,
                  borderRadius: "var(--radius-md)",
                  padding: "var(--space-3)",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
                  <strong>{label}</strong>
                  <span style={{ color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>
                    {passage.version}
                  </span>
                </div>
                <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>{passage.text}</div>
              </button>
            );
          })}
        </ScrollArea>

        <div
          style={{
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-base)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--space-4)",
          }}
        >
          {featured ? (
            <>
              <div>
                <div style={{ color: "var(--color-primary)", fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>
                  FEATURED PASSAGE
                </div>
                <h3 style={{ margin: "6px 0 0", color: "var(--fg-base)" }}>{referenceLabel(featured)}</h3>
              </div>
              <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>{featured.text}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                {featured.themes.map((theme) => (
                  <span
                    key={theme}
                    style={{
                      borderRadius: "var(--radius-full)",
                      border: "1px solid var(--border-base)",
                      padding: "4px 10px",
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--text-xs)",
                      color: "var(--fg-muted)",
                    }}
                  >
                    {theme}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => onPreviewSlide(featured)}
                style={{
                  marginTop: "auto",
                  border: "1px solid var(--color-primary)",
                  background: "var(--color-primary)",
                  color: "white",
                  borderRadius: "var(--radius-md)",
                  padding: "10px 12px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-xs)",
                  cursor: "pointer",
                }}
              >
                SEND TO PREVIEW
              </button>
            </>
          ) : (
            <div style={{ color: "var(--fg-subtle)" }}>No passages match the current filter.</div>
          )}
        </div>
      </div>
    </div>
  );
}
