import { useLayoutEffect, useRef, useState } from "react";

import type { SongSlide } from "../stores/songStore";
import type { ProjectorSlide } from "../types/state";
import { MediaTab } from "./LocalLibrary/media/MediaTab";
import { ScripturesTab } from "./LocalLibrary/scriptures/ScripturesTab";
import { SongsTab } from "./LocalLibrary/songs/SongsTab";
import { TemplatesTab } from "./LocalLibrary/templates/TemplatesTab";
import type { LibraryNavigationHandler, LibraryTab, ScriptureSearchMode } from "./LocalLibrary/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type { LibraryNavigationHandler, LibraryTab, ScriptureSearchMode } from "./LocalLibrary/types";

interface LocalLibraryPanelProps {
  previewReference: string | null;
  liveReference: string | null;
  activeTab: LibraryTab;
  searchQuery: string;
  searchMode: ScriptureSearchMode;
  onActiveTabChange: (tab: LibraryTab) => void;
  onPreviewSlide: (slide: ProjectorSlide) => void;
  onSendLive: (slide: ProjectorSlide) => void;
  onAddToSchedule?: (slide: ProjectorSlide) => void;
  onCreateCue?: (cue: { title: string; slides: SongSlide[] }) => void;
  onNavigationHandlerChange?: (handler: LibraryNavigationHandler | null) => void;
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
  searchMode,
  onActiveTabChange,
  previewReference,
  liveReference,
  onPreviewSlide,
  onSendLive,
  onAddToSchedule,
  onCreateCue,
  onNavigationHandlerChange,
}: LocalLibraryPanelProps) {
  const searchableProps = { previewReference, liveReference, onPreviewSlide, onSendLive, onAddToSchedule, onCreateCue, searchQuery, onNavigationHandlerChange };
  const previousTabRef = useRef(activeTab);
  const [tabDirection, setTabDirection] = useState<"forward" | "backward">("forward");
  const [templatesMounted, setTemplatesMounted] = useState(activeTab === "templates");

  useLayoutEffect(() => {
    const previousIndex = TABS.findIndex((tab) => tab.id === previousTabRef.current);
    const activeIndex = TABS.findIndex((tab) => tab.id === activeTab);
    setTabDirection(activeIndex >= previousIndex ? "forward" : "backward");
    previousTabRef.current = activeTab;
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
        {activeTab !== "templates" ? (
          <div key={activeTab} className={`library-tab-slide library-tab-slide--${tabDirection}`}>
            {activeTab === "scriptures" && <ScripturesTab {...searchableProps} searchMode={searchMode} />}
            {activeTab === "songs" && <SongsTab {...searchableProps} />}
            {activeTab === "media" && <MediaTab />}
          </div>
        ) : null}
      </div>
    </div>
  );
}
