import type { Song } from "../../../stores/songStore";
import { songContextMenuItemStyle } from "../styles";
import type { SongContextMenuState } from "../types";

export function SongContextMenu({
  contextMenu,
  setContextMenu,
  setStudioSong,
  setIsStudioOpen,
  setRenameTarget,
  setRenameTitle,
  setRenameArtist,
  setDeleteTarget,
}: {
  contextMenu: SongContextMenuState;
  setContextMenu: React.Dispatch<React.SetStateAction<SongContextMenuState | null>>;
  setStudioSong: React.Dispatch<React.SetStateAction<Song | null>>;
  setIsStudioOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setRenameTarget: React.Dispatch<React.SetStateAction<Song | null>>;
  setRenameTitle: React.Dispatch<React.SetStateAction<string>>;
  setRenameArtist: React.Dispatch<React.SetStateAction<string>>;
  setDeleteTarget: React.Dispatch<React.SetStateAction<Song | null>>;
}) {
  return (
    <div
      role="menu"
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        position: "fixed",
        left: Math.min(contextMenu.x, window.innerWidth - 180),
        top: Math.min(contextMenu.y, window.innerHeight - 140),
        width: "160px",
        background: "var(--bg-surface)",
        border: "none",
        borderRadius: "8px",
        boxShadow: "var(--shadow-lg)",
        padding: "4px",
        zIndex: 1000,
      }}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          const s = contextMenu.song;
          setContextMenu(null);
          setStudioSong(s);
          setIsStudioOpen(true);
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.background = "var(--color-primary-muted)";
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = "transparent";
        }}
        style={songContextMenuItemStyle}
      >
        Edit
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          const s = contextMenu.song;
          setContextMenu(null);
          setRenameTarget(s);
          setRenameTitle(s.title);
          setRenameArtist(s.artist);
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.background = "var(--color-primary-muted)";
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = "transparent";
        }}
        style={songContextMenuItemStyle}
      >
        Rename
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          const s = contextMenu.song;
          setContextMenu(null);
          setDeleteTarget(s);
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.background = "var(--color-error-muted)";
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = "transparent";
        }}
        style={{ ...songContextMenuItemStyle, color: "var(--color-error)" }}
      >
        Delete
      </button>
    </div>
  );
}
