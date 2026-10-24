import { useLayoutEffect, useRef, useState } from "react";
import type { LibraryTab, LocalLibraryPanelProps } from "./Library/types";
import { ScripturesTab } from "./Library/Scriptures/ScripturesTab";
import { SongsTab } from "./Library/Songs/SongsTab";
import { MediaTab } from "./Library/Media/MediaTab";
import { TemplatesTab } from "./Library/Templates/TemplatesTab";
import { OverlaysTab } from "./Overlays/OverlaysTab";

export type { LibraryTab, LibraryNavigationHandler, ScriptureSearchMode } from "./Library/types";

const TABS: { id: LibraryTab; label: string }[] = [
  { id: "scriptures", label: "Scriptures" },
  { id: "songs", label: "Songs" },
  { id: "media", label: "Media" },
  { id: "overlays", label: "Overlays" },
  { id: "templates", label: "Templates" },
];

export function LocalLibraryPanel({
  activeTab,
  searchQuery,
  searchMode,
  onActiveTabChange,
  previewReference,
  liveReference,
  onPreviewSlide,
  onSendLive,
  previewMedia,
  liveMedia,
  onPreviewMedia,
  onSendMedia,
  onSelectedScriptureChange,
  onSelectedSongChange,
  onAddToSchedule,
  onCreateCue,
  onNavigationHandlerChange,
}: LocalLibraryPanelProps) {
  const searchableProps = { previewReference, liveReference, onPreviewSlide, onSendLive, onSelectedScriptureChange, onSelectedSongChange, onAddToSchedule, onCreateCue, searchQuery, onNavigationHandlerChange };
  const previousTabRef = useRef(activeTab);
  const [tabDirection, setTabDirection] = useState<"forward" | "backward">("forward");
  const [mediaClickAction, setMediaClickAction] = useState<"preview" | "live">("live");
  const [templatesMounted, setTemplatesMounted] = useState(activeTab === "templates");
  const [mediaMounted, setMediaMounted] = useState(activeTab === "media");
  if (activeTab === "media" && !mediaMounted) setMediaMounted(true);

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
        {activeTab !== "templates" && activeTab !== "media" ? (
          <div key={activeTab} className={`library-tab-slide library-tab-slide--${tabDirection}`}>
            {activeTab === "scriptures" && <ScripturesTab {...searchableProps} searchMode={searchMode} />}
            {activeTab === "songs" && <SongsTab {...searchableProps} />}
            {activeTab === "overlays" && <OverlaysTab />}
          </div>
        ) : null}
        {mediaMounted ? (
          <div
            data-library-tab="media"
            className={activeTab === "media" ? `library-tab-slide library-tab-slide--${tabDirection}` : undefined}
            style={{ display: activeTab === "media" ? "block" : "none", height: "100%" }}
            aria-hidden={activeTab !== "media"}
          >
            <MediaTab onPreviewMedia={onPreviewMedia} onSendMedia={onSendMedia} clickAction={mediaClickAction} onClickActionChange={setMediaClickAction} previewMedia={previewMedia} liveMedia={liveMedia} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
