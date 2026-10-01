import type { Song } from "../../../stores/songStore";
import type { ProjectorSlide } from "../../../types/state";
import { ScripturePane } from "../primitives";
import { addSongButtonStyle } from "../styles";
import type { SongContextMenuState } from "../types";
import { toSongProjectorSlide } from "./songUtils";

export function SongListColumn({
  filteredSongs,
  selectedSongId,
  hoveredSongId,
  setHoveredSongId,
  handleSongSelect,
  onPreviewSlide,
  onSendLive,
  setContextMenu,
  normalizedSearchQuery,
  setIsNewSongModalOpen,
}: {
  filteredSongs: Song[];
  selectedSongId: string | null;
  hoveredSongId: string | null;
  setHoveredSongId: React.Dispatch<React.SetStateAction<string | null>>;
  handleSongSelect: (songId: string) => void;
  onPreviewSlide: (slide: ProjectorSlide) => void;
  onSendLive: (slide: ProjectorSlide) => void;
  setContextMenu: React.Dispatch<React.SetStateAction<SongContextMenuState | null>>;
  normalizedSearchQuery: string;
  setIsNewSongModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (
    <div style={{ position: "relative", minWidth: 0, minHeight: 0, overflow: "hidden", background: "var(--bg-base)" }}>
      <ScripturePane
        title="Song Title"
        showDivider={false}
        action={
          <span style={{ flex: "0 0 140px", textAlign: "right", color: "var(--fg-muted)" }}>Artiste</span>
        }
      >
      {filteredSongs.map((song) => {
        const isSongActive = selectedSongId === song.id;
        const isSongHighlighted = isSongActive || hoveredSongId === song.id;
        return (
          <button
            key={song.id}
            type="button"
            onMouseEnter={() => setHoveredSongId(song.id)}
            onMouseLeave={() => setHoveredSongId((current) => (current === song.id ? null : current))}
            onClick={() => {
              handleSongSelect(song.id);
              const firstSlide = song.slides[0];
              if (firstSlide) onPreviewSlide(toSongProjectorSlide(song, firstSlide, 0));
            }}
            onDoubleClick={() => {
              const firstSlide = song.slides[0];
              if (!firstSlide) return;
              handleSongSelect(song.id);
              onSendLive(toSongProjectorSlide(song, firstSlide, 0));
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ song, x: e.clientX, y: e.clientY });
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              width: "100%",
              boxSizing: "border-box",
              minHeight: 30,
              padding: "6px 12px",
              background: isSongHighlighted ? "var(--color-primary-muted)" : "transparent",
              border: "none",
              borderLeft: isSongActive ? "2px solid var(--color-primary)" : "2px solid transparent",
              cursor: "pointer",
              textAlign: "left",
              outline: "none",
            }}
          >
            <span
              style={{
                flex: "1 1 auto",
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: "var(--text-xs)",
                fontWeight: isSongActive ? 600 : 400,
                color: isSongHighlighted ? "var(--color-primary)" : "var(--fg-base)",
              }}
            >
              {song.title}
            </span>
            <span
              title={song.artist}
              style={{
                flex: "0 0 140px",
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                textAlign: "right",
                fontSize: "var(--text-xs)",
                fontWeight: isSongActive ? 600 : 400,
                color: isSongHighlighted ? "var(--color-primary)" : "var(--fg-muted)",
              }}
            >
              {song.artist}
            </span>
          </button>
        );
      })}
      {filteredSongs.length === 0 && (
        <div
          style={{
            padding: "24px 16px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            textAlign: "center",
          }}
        >
          <span style={{ fontSize: "12px", color: "var(--fg-subtle)", fontStyle: "italic" }}>
            {normalizedSearchQuery ? "No matching songs" : "No songs in library"}
          </span>
          {!normalizedSearchQuery && (
            <button
              type="button"
              onClick={() => setIsNewSongModalOpen(true)}
              aria-label="Add song"
              title="Add song"
              style={addSongButtonStyle}
            >
              +
            </button>
          )}
        </div>
      )}
      </ScripturePane>

      {/* Add Song button, pinned to bottom-right of the song column */}
      <button
        type="button"
        onClick={() => setIsNewSongModalOpen(true)}
        aria-label="Add song"
        title="Add song"
        style={{
          position: "absolute",
          right: "16px",
          bottom: "16px",
          zIndex: 5,
          ...addSongButtonStyle,
        }}
      >
        +
      </button>
    </div>
  );
}
