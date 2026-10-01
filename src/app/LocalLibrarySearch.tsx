import { useEffect, useRef, useState } from "react";

import type { LibraryTab, ScriptureSearchMode } from "../components/LocalLibraryPanel";
import { knownScriptureBooks, matchScriptureReferenceIncremental, resolveScriptureSearch } from "../lib/scriptureSearch";
import type { LibraryScheduleItem } from "./types";

export function LocalLibrarySearch({
  activeTab,
  searchQuery,
  onSearchQueryChange,
  searchMode,
  onSearchModeChange,
  scheduledItems,
  onAddToSchedule,
  onRemoveFromSchedule,
  onSchedulePreview,
  onScheduleLive,
  onOpenCue,
}: {
  activeTab: LibraryTab;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  searchMode: ScriptureSearchMode;
  onSearchModeChange: (mode: ScriptureSearchMode) => void;
  scheduledItems: LibraryScheduleItem[];
  onAddToSchedule: () => void;
  onRemoveFromSchedule: (id: string) => void;
  onSchedulePreview: (item: LibraryScheduleItem) => void;
  onScheduleLive: (item: LibraryScheduleItem) => void;
  onOpenCue: (item: LibraryScheduleItem) => void;
}) {
  const canSearch = activeTab === "scriptures" || activeTab === "songs";
  const label = activeTab === "songs" ? "Search songs" : "Search scriptures";
  const canAdd = canSearch && searchQuery.trim().length > 0;
  const clickTimeoutRef = useRef<number | null>(null);
  const [hoveredScheduleId, setHoveredScheduleId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current !== null) {
        window.clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  const handleItemClick = (item: LibraryScheduleItem) => {
    if (item.cueSlides) return;
    if (clickTimeoutRef.current !== null) {
      window.clearTimeout(clickTimeoutRef.current);
    }

    clickTimeoutRef.current = window.setTimeout(() => {
      onSchedulePreview(item);
      clickTimeoutRef.current = null;
    }, 220);
  };

  const handleItemActivate = (item: LibraryScheduleItem) => {
    if (clickTimeoutRef.current !== null) {
      window.clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }

    if (item.cueSlides) {
      onOpenCue(item);
      return;
    }

    onScheduleLive(item);
  };

  return (
    <div
      style={{
        height: "100%",
        padding: "14px 16px 12px",
        boxSizing: "border-box",
        background: "var(--bg-base)",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "grid",
          gridTemplateRows: "auto auto minmax(0, 1fr)",
          gap: "10px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <label
            style={{
              display: "grid",
              gridTemplateColumns: activeTab === "scriptures" ? "minmax(0, 1fr) auto" : "minmax(0, 1fr)",
              alignItems: "center",
              background: "var(--bg-elevated)",
              border: "none",
              borderRadius: "4px",
              overflow: "hidden",
            }}
          >
            <input
              type="search"
              value={searchQuery}
              disabled={!canSearch}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") {
                  return;
                }

                if (activeTab !== "scriptures") {
                  return;
                }

                let scheduledValue: string;
                if (searchMode === "reference") {
                  const match = matchScriptureReferenceIncremental(searchQuery, knownScriptureBooks);
                  if (!match.matchedBook || match.chapter == null || match.verse == null) {
                    return;
                  }
                  scheduledValue = `${match.matchedBook} ${match.chapter}:${match.verse}`;
                } else {
                  const resolved = resolveScriptureSearch(searchQuery);
                  if (!resolved) {
                    return;
                  }
                  scheduledValue = resolved.value;
                }

                onSearchQueryChange(scheduledValue);
                onScheduleLive({
                  id: `search-${Date.now()}`,
                  kind: "scriptures",
                  value: scheduledValue,
                });
              }}
              placeholder={canSearch ? `${label}...` : "Search unavailable"}
              aria-label={label}
              style={{
                minWidth: 0,
                height: 34,
                padding: "0 11px",
                border: "none",
                outline: "none",
                background: "transparent",
                color: canSearch ? "var(--fg-base)" : "var(--fg-subtle)",
                fontSize: "var(--text-xs)",
              }}
            />
            {activeTab === "scriptures" && (
              <div role="radiogroup" aria-label="Scripture search mode" style={{ display: "flex", marginRight: 5 }}>
                {(["words", "reference"] as const).map((mode) => {
                  const isActive = searchMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      onClick={() => onSearchModeChange(mode)}
                      title={mode === "words" ? "Search verse text" : "Search by book, chapter & verse"}
                      style={{
                        height: 24,
                        padding: "0 8px",
                        background: isActive ? "var(--color-primary)" : "var(--bg-surface)",
                        border: "none",
                        borderRadius: "3px",
                        marginLeft: 4,
                        cursor: "pointer",
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px",
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                        color: isActive ? "var(--fg-on-accent)" : "var(--fg-muted)",
                      }}
                    >
                      {mode === "words" ? "WORDS" : "REF"}
                    </button>
                  );
                })}
              </div>
            )}
          </label>
          <button
            type="button"
            onClick={() => onAddToSchedule()}
            disabled={!canAdd}
            style={{
              width: 34,
              height: 34,
              display: "grid",
              placeItems: "center",
              borderRadius: "4px",
              background: "var(--bg-elevated)",
              color: canAdd ? "var(--fg-base)" : "var(--fg-subtle)",
              fontFamily: "var(--font-mono)",
              fontSize: "18px",
              lineHeight: 1,
              border: "none",
              cursor: canAdd ? "pointer" : "not-allowed",
            }}
          >
            +
          </button>
        </div>

        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "8px",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--fg-subtle)",
          }}
        >
          Schedule
        </div>

        <div
          style={{
            minHeight: 0,
            border: "none",
            borderRadius: "4px",
            overflow: "auto",
            background: "var(--bg-elevated)",
          }}
        >
          {scheduledItems.length === 0 ? (
            <div
              style={{
                padding: "10px 12px",
                color: "var(--fg-subtle)",
                fontSize: "var(--text-xs)",
                fontStyle: "italic",
              }}
            >
              No scheduled scriptures or songs yet.
            </div>
          ) : (
            scheduledItems.map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => handleItemClick(item)}
                onDoubleClick={() => handleItemActivate(item)}
                onMouseEnter={() => setHoveredScheduleId(item.id)}
                onMouseLeave={() => setHoveredScheduleId((current) => (current === item.id ? null : current))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleItemActivate(item);
                  }
                }}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto minmax(0, 1fr) auto",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 10px",
                  cursor: "pointer",
                  background: hoveredScheduleId === item.id ? "var(--color-primary-muted)" : "transparent",
                  transition: "background 120ms ease",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "8px",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--fg-subtle)",
                  }}
                >
                  {item.kind === "scriptures" ? "Scripture" : item.cueSlides ? "Cued" : "Song"}
                </span>
                <span
                  style={{
                    minWidth: 0,
                    fontSize: "var(--text-xs)",
                    color: "var(--fg-base)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={item.value}
                >
                  {item.value}
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveFromSchedule(item.id);
                  }}
                  aria-label="Remove scheduled item"
                  style={{
                    width: 22,
                    height: 22,
                    border: "none",
                    borderRadius: "3px",
                    background: "transparent",
                    color: "var(--fg-muted)",
                    cursor: "pointer",
                    fontFamily: "var(--font-mono)",
                    fontSize: "12px",
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
