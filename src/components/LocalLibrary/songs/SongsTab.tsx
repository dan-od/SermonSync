import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSongStore, type Song } from "../../../stores/songStore";
import { NewSongModal } from "../../Songs/NewSongModal";
import { SongStudioModal } from "../../Songs/SongStudioModal";
import { normalizeSearch } from "../libraryUtils";
import type { SearchableLibraryTabProps, SongContextMenuState } from "../types";
import { SongContextMenu } from "./SongContextMenu";
import { DeleteSongDialog, RenameSongDialog } from "./SongDialogs";
import { SongListColumn } from "./SongListColumn";
import { SongSlidesColumn } from "./SongSlidesColumn";
import { toSongProjectorSlide } from "./songUtils";

export function SongsTab({ previewReference, liveReference, onPreviewSlide, onSendLive, onCreateCue, searchQuery, onNavigationHandlerChange }: SearchableLibraryTabProps) {
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
        <SongListColumn
          filteredSongs={filteredSongs}
          selectedSongId={selectedSongId}
          hoveredSongId={hoveredSongId}
          setHoveredSongId={setHoveredSongId}
          handleSongSelect={handleSongSelect}
          onPreviewSlide={onPreviewSlide}
          onSendLive={onSendLive}
          setContextMenu={setContextMenu}
          normalizedSearchQuery={normalizedSearchQuery}
          setIsNewSongModalOpen={setIsNewSongModalOpen}
        />

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
        <SongSlidesColumn
          selectedSong={selectedSong}
          previewReference={previewReference}
          liveReference={liveReference}
          selectedSlideReference={selectedSlideReference}
          setSelectedSlideReference={setSelectedSlideReference}
          slideClickAction={slideClickAction}
          setSlideClickAction={setSlideClickAction}
          onPreviewSlide={onPreviewSlide}
          onSendLive={onSendLive}
        />
      </div>

      {/* Right-click Context Menu */}
      {contextMenu ? (
        <SongContextMenu
          contextMenu={contextMenu}
          setContextMenu={setContextMenu}
          setStudioSong={setStudioSong}
          setIsStudioOpen={setIsStudioOpen}
          setRenameTarget={setRenameTarget}
          setRenameTitle={setRenameTitle}
          setRenameArtist={setRenameArtist}
          setDeleteTarget={setDeleteTarget}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteSongDialog
          deleteTarget={deleteTarget}
          setDeleteTarget={setDeleteTarget}
          deleteSong={deleteSong}
          selectedSongId={selectedSongId}
          setSelectedSongId={setSelectedSongId}
        />
      ) : null}

      {/* Rename Dialog */}
      {renameTarget ? (
        <RenameSongDialog
          renameTitle={renameTitle}
          setRenameTitle={setRenameTitle}
          renameArtist={renameArtist}
          setRenameArtist={setRenameArtist}
          setRenameTarget={setRenameTarget}
          confirmRename={confirmRename}
        />
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
