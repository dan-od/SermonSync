import { createPortal } from "react-dom";

import type { Song } from "../../../stores/songStore";
import { deleteSongButton, renameSecondaryButton } from "../styles";

export function DeleteSongDialog({
  deleteTarget,
  setDeleteTarget,
  deleteSong,
  selectedSongId,
  setSelectedSongId,
}: {
  deleteTarget: Song;
  setDeleteTarget: React.Dispatch<React.SetStateAction<Song | null>>;
  deleteSong: (id: string) => void;
  selectedSongId: string | null;
  setSelectedSongId: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  return createPortal(
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setDeleteTarget(null);
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: "var(--overlay-backdrop)",
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-song-title"
        aria-describedby="delete-song-description"
        style={{
          width: "min(400px, 94vw)",
          padding: 20,
          border: "1px solid var(--border-base)",
          borderRadius: "var(--radius-lg)",
          background: "var(--bg-surface)",
          boxShadow: "var(--shadow-lg)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <h2 id="delete-song-title" style={{ margin: 0, color: "var(--fg-base)", fontSize: 16, fontWeight: 700 }}>
          Delete song?
        </h2>
        <p id="delete-song-description" style={{ margin: 0, color: "var(--fg-muted)", fontSize: 12, lineHeight: 1.5 }}>
          Delete &quot;{deleteTarget.title}&quot;? This cannot be undone.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            autoFocus
            onClick={() => setDeleteTarget(null)}
            style={renameSecondaryButton}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              deleteSong(deleteTarget.id);
              if (selectedSongId === deleteTarget.id) setSelectedSongId(null);
              setDeleteTarget(null);
            }}
            style={deleteSongButton}
          >
            Delete
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export function RenameSongDialog({
  renameTitle,
  setRenameTitle,
  renameArtist,
  setRenameArtist,
  setRenameTarget,
  confirmRename,
}: {
  renameTitle: string;
  setRenameTitle: React.Dispatch<React.SetStateAction<string>>;
  renameArtist: string;
  setRenameArtist: React.Dispatch<React.SetStateAction<string>>;
  setRenameTarget: React.Dispatch<React.SetStateAction<Song | null>>;
  confirmRename: () => void;
}) {
  return createPortal(
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setRenameTarget(null);
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: "rgba(8, 9, 14, 0.6)",
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-song-title"
        style={{
          width: "min(400px, 94vw)",
          padding: 20,
          border: "1px solid var(--border-base)",
          borderRadius: 10,
          background: "var(--bg-surface)",
          boxShadow: "var(--shadow-lg)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <h2 id="rename-song-title" style={{ margin: 0, color: "var(--fg-base)", fontSize: 16, fontWeight: 700 }}>
          Rename song
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, color: "var(--fg-muted)", fontSize: 12 }}>
            Title
            <input
              autoFocus
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmRename();
                if (e.key === "Escape") setRenameTarget(null);
              }}
              style={{
                padding: "8px 10px",
                border: "1px solid var(--border-base)",
                borderRadius: 6,
                background: "var(--bg-base)",
                color: "var(--fg-base)",
                fontSize: 13,
                outline: "none",
              }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, color: "var(--fg-muted)", fontSize: 12 }}>
            Artist
            <input
              value={renameArtist}
              onChange={(e) => setRenameArtist(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmRename();
                if (e.key === "Escape") setRenameTarget(null);
              }}
              style={{
                padding: "8px 10px",
                border: "1px solid var(--border-base)",
                borderRadius: 6,
                background: "var(--bg-base)",
                color: "var(--fg-base)",
                fontSize: 13,
                outline: "none",
              }}
            />
          </label>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onClick={() => setRenameTarget(null)}
            style={{
              padding: "8px 14px",
              border: "none",
              borderRadius: 6,
              background: "var(--bg-elevated)",
              color: "var(--fg-base)",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmRename}
            disabled={!renameTitle.trim()}
            style={{
              padding: "8px 14px",
              border: "none",
              borderRadius: 6,
              background: "var(--color-primary)",
              color: "var(--fg-on-accent)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              opacity: renameTitle.trim() ? 1 : 0.5,
            }}
          >
            Save
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
