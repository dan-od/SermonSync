import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type Song, type SongSlide, useSongStore } from "../../../stores/songStore";
import type { ProjectorSlide } from "../../../types/state";
import { NewSongModal } from "../../Songs/NewSongModal";
import { SongStudioModal } from "../../Songs/SongStudioModal";
import type { SearchableLibraryTabProps } from "../types";
import { addSongButtonStyle, deleteSongButton, renameSecondaryButton, slideActionButtonStyle, songContextMenuItemStyle } from "../styles";
import { PaneEmpty } from "../shared";
import { normalizeSearch } from "../utils";
import { ScripturePane } from "../Scriptures/ScripturePane";
import { SlideThumbnail } from "./SlideThumbnail";

export interface SongContextMenuState {
  song: Song;
  x: number;
  y: number;
}

export function SongsTab({ previewReference, liveReference, onPreviewSlide, onSendLive, onCreateCue, searchQuery, onNavigationHandlerChange, onSelectedSongChange }: SearchableLibraryTabProps) {
  const songs = useSongStore((s) => s.songs);
  const initializeSongs = useSongStore((s) => s.initialize);
  const deleteSong = useSongStore((s) => s.deleteSong);
  const renameSong = useSongStore((s) => s.renameSong);

  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [hoveredSongId, setHoveredSongId] = useState<string | null>(null);
  const [selectedSlideReference, setSelectedSlideReference] = useState<string | null>(null);
  const [slidesWidth, setSlidesWidth] = useState<number>(738);
  const [slideClickAction, setSlideClickAction] = useState<"preview" | "live">("live");

  const [isNewSongModalOpen, setIsNewSongModalOpen] = useState(false);
  const [studioSong, setStudioSong] = useState<Song | null>(null);
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<SongContextMenuState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Song | null>(null);
  const [renameTarget, setRenameTarget] = useState<Song | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameArtist, setRenameArtist] = useState("");

  const gridRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ mouseX: 0, slidesWidth: 0 });

  useEffect(() => {
    initializeSongs();
  }, [initializeSongs]);

  useEffect(() => {
    if (!contextMenu) return;
    const handlePointerDown = () => setContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  const normalizedSearchQuery = normalizeSearch(searchQuery);

  // Keep the library in a predictable title order while applying the shared search.
  const filteredSongs = useMemo(() => {
    return songs.filter((song) => {
      if (!normalizedSearchQuery) {
        return true;
      }

      return `${song.title} ${song.artist} ${song.slides.map((slide) => `${slide.label} ${slide.text}`).join(" ")}`
        .toLowerCase()
        .includes(normalizedSearchQuery);
    }).sort((first, second) => first.title.localeCompare(second.title, undefined, { sensitivity: "base" }));
  }, [normalizedSearchQuery, songs]);

  // Find currently selected song
  const selectedSong = useMemo(() => {
    return songs.find((song) => song.id === selectedSongId) ?? null;
  }, [selectedSongId, songs]);

  const handleSongSelect = (songId: string) => {
    setSelectedSongId(songId);
    setSelectedSlideReference(null);
    onSelectedSongChange?.(songs.find((song) => song.id === songId) ?? null);
  };

  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!gridRef.current) return;

    dragStartRef.current = {
      mouseX: e.clientX,
      slidesWidth: slidesWidth,
    };
    isDraggingRef.current = true;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current || !gridRef.current) return;
      const deltaX = moveEvent.clientX - dragStartRef.current.mouseX;
      const nextSlidesWidth = dragStartRef.current.slidesWidth - deltaX;

      const containerWidth = gridRef.current.clientWidth;
      const minSlides = 220;
      const maxSlides = Math.max(minSlides, containerWidth - 300);

      setSlidesWidth(Math.min(maxSlides, Math.max(minSlides, nextSlidesWidth)));
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Helper to map a song slide to a ProjectorSlide
  const toSongProjectorSlide = (song: Song, slide: SongSlide, index: number): ProjectorSlide => {
    return {
      reference: {
        book: song.title,
        chapter: 1,
        verse: index + 1,
      },
      text: slide.text,
      version: "SONG",
    };
  };

  const navigateSongSlides = useCallback(
    (direction: -1 | 1) => {
      const song = selectedSong ?? filteredSongs[0];
      if (!song || song.slides.length === 0) return;

      if (!selectedSong) setSelectedSongId(song.id);
      const currentReference = selectedSlideReference ?? liveReference;
      const currentIndex = song.slides.findIndex((_, index) => `${song.title} 1:${index + 1}` === currentReference);
      const nextIndex = (currentIndex + direction + song.slides.length) % song.slides.length;
      const nextSlide = toSongProjectorSlide(song, song.slides[nextIndex], nextIndex);
      setSelectedSlideReference(`${song.title} 1:${nextIndex + 1}`);
      onPreviewSlide(nextSlide);
      onSendLive(nextSlide);
    },
    [filteredSongs, liveReference, onPreviewSlide, onSendLive, selectedSlideReference, selectedSong],
  );

  useEffect(() => {
    onNavigationHandlerChange?.(navigateSongSlides);
    return () => onNavigationHandlerChange?.(null);
  }, [navigateSongSlides, onNavigationHandlerChange]);

  const handleSongKeyDownCapture = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    // Song Studio's textarea is portaled but still bubbles through this tree; let it handle its own cursor movement.
    const target = event.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    navigateSongSlides(event.key === "ArrowLeft" ? -1 : 1);
  };

  const confirmRename = () => {
    if (!renameTarget || !renameTitle.trim()) return;
    renameSong(renameTarget.id, renameTitle.trim(), renameArtist.trim());
    setRenameTarget(null);
  };

  return (
    <div
      onKeyDownCapture={handleSongKeyDownCapture}
      style={{
        display: "flex",
        height: "100%",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        ref={gridRef}
        style={{
          flex: 1,
          minWidth: 0,
          height: "100%",
          display: "grid",
          gridTemplateColumns: `minmax(0, 1.2fr) auto ${slidesWidth}px`,
          gridTemplateRows: "100%",
          overflow: "hidden",
          borderRight: "1px solid var(--border-base)",
        }}
      >
        {/* Column 1: Song (title + artiste in a single row, single highlight) */}
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

        {/* Column 2: Draggable Demarcation Line */}
        <div
          onMouseDown={handleDividerMouseDown}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize column"
          style={{
            gridColumn: "2",
            width: "7px",
            height: "100%",
            cursor: "col-resize",
            background: "transparent",
            display: "flex",
            justifyContent: "center",
            marginLeft: "-3px",
            marginRight: "-3px",
            zIndex: 10,
            userSelect: "none",
            position: "relative",
          }}
        >
          <div
            style={{
              width: "1px",
              height: "100%",
              background: "var(--border-base)",
            }}
          />
        </div>

        {/* Column 3: Slides (4 per row) */}
        <ScripturePane
          title="Slides"
          action={
            <div role="group" aria-label="Slide click action" style={{ display: "flex", overflow: "hidden", borderRadius: "var(--radius-sm)" }}>
              <button
                type="button"
                aria-pressed={slideClickAction === "preview"}
                onClick={() => setSlideClickAction("preview")}
                style={slideActionButtonStyle(slideClickAction === "preview")}
              >
                Preview First
              </button>
              <button
                type="button"
                aria-pressed={slideClickAction === "live"}
                onClick={() => setSlideClickAction("live")}
                style={slideActionButtonStyle(slideClickAction === "live")}
              >
                Live
              </button>
            </div>
          }
        >
          {selectedSong ? (
            <div style={{ padding: "var(--space-3)" }}>
              <div
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-base)",
                  borderRadius: "var(--radius-lg)",
                  padding: "var(--space-4)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-3)",
                  boxShadow: "var(--shadow-md)",
                }}
              >
                {/* 4-up Grid */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: "var(--space-3)",
                  }}
                >
                  {selectedSong.slides.map((slide, index) => {
                    const projSlide = toSongProjectorSlide(selectedSong, slide, index);
                    const label = `${projSlide.reference.book} ${projSlide.reference.chapter}:${projSlide.reference.verse}`;
                    const isPreview = previewReference === label;
                    const isLive = liveReference === label;
                    const isSelected = selectedSlideReference === label || (selectedSlideReference === null && (isPreview || isLive));
                    const selectSlide = () => setSelectedSlideReference(label);
                    const sendSlideLive = () => {
                      selectSlide();
                      onSendLive(projSlide);
                    };
                    const previewSlide = () => {
                      selectSlide();
                      onPreviewSlide(projSlide);
                    };

                    return (
                      <div key={index} style={{ position: "relative" }}>
                      <SlideThumbnail
                        key={index}
                        slide={projSlide}
                        label={slide.label}
                        isPreview={isPreview}
                        isLive={isLive}
                        isSelected={isSelected}
                        onClick={slideClickAction === "preview" ? previewSlide : sendSlideLive}
                        onDoubleClick={slideClickAction === "preview" ? sendSlideLive : () => {}}
                        onFocus={selectSlide}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            if (slideClickAction === "preview") {
                              previewSlide();
                            } else {
                              sendSlideLive();
                            }
                          }
                        }}
                      />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <PaneEmpty>Select a song to view slides</PaneEmpty>
          )}
        </ScripturePane>
      </div>

      {/* Right-click Context Menu */}
      {contextMenu ? (
        <div
          role="menu"
          onPointerDown={(event) => event.stopPropagation()}
          style={{
            outline: "none",
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
      ) : null}

      {deleteTarget ? createPortal(
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
      ) : null}

      {/* Rename Dialog */}
      {renameTarget ? createPortal(
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
      ) : null}

      {/* New Song Modal */}
      <NewSongModal
        open={isNewSongModalOpen}
        onClose={() => setIsNewSongModalOpen(false)}
        onSongCreated={(newSong) => {
          setIsNewSongModalOpen(false);
          setStudioSong(newSong);
          setIsStudioOpen(true);
        }}
      />

      {/* Song Studio Modal */}
      <SongStudioModal
        open={isStudioOpen}
        song={studioSong}
        onCreateCue={onCreateCue}
        onClose={() => {
          setIsStudioOpen(false);
          setStudioSong(null);
        }}
      />
    </div>
  );
}
