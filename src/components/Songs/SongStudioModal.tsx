import { createPortal } from "react-dom";
import { type Song, type SongSlide } from "../../stores/songStore";
import { ProjectionCueModal } from "./ProjectionCueModal";
import { SongSlideList, SongTextEditor } from "./SongEditor";
import { SongPreview } from "./SongPreview";
import { SongStudioHeader } from "./SongStudioHeader";
import { useSongStudioEditor } from "./useSongStudioEditor";

interface SongStudioModalProps {
  open: boolean;
  song: Song | null;
  onClose: () => void;
  onCreateCue?: (cue: { title: string; slides: SongSlide[] }) => void;
  onBackToResults?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}


export function SongStudioModal({ open, song, onClose, onCreateCue, onBackToResults, onDirtyChange }: SongStudioModalProps) {
  if (!song) return null;

  return (
    <SongStudioContent
      key={song.id}
      open={open}
      song={song}
      onClose={onClose}
      onCreateCue={onCreateCue}
      onBackToResults={onBackToResults}
      onDirtyChange={onDirtyChange}
    />
  );
}

function SongStudioContent({ open, song, onClose, onCreateCue, onBackToResults, onDirtyChange }: Omit<SongStudioModalProps, "song"> & { song: Song }) {
  const {
    title,
    setTitle,
    artist,
    setArtist,
    slides,
    songText,
    cueModalOpen,
    setCueModalOpen,
    cueOrder,
    setCueOrder,
    activeSlideIndex,
    setActiveSlideIndex,
    defaultSongScene,
    currentSlide,
    hasTaggedSections,
    handleSave,
    handleClose,
    handleSongTextChange,
    handleSongTextKeyDown,
    openCueBuilder,
    createProjectionCue,
    handleAddSlide,
    handleDuplicateSlide,
    handleDeleteSlide,
    handleMoveSlide,
    handleReorder,
    handleSlideLabelChange,
    activeProjectorSlide,
  } = useSongStudioEditor({ song, onClose, onCreateCue, onDirtyChange });

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Song studio"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        background: "var(--overlay-backdrop)",
        display: open ? "flex" : "none",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        className="studio-modal"
        style={{
          width: "min(1380px, 98vw)",
          height: "min(840px, 94vh)",
          background: "var(--bg-base)",
          borderRadius: "12px",
          border: "1px solid var(--border-base)",
          display: "grid",
          gridTemplateRows: "auto minmax(0, 1fr) auto",
          overflow: "hidden",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, borderBottom: onBackToResults ? "1px solid var(--border-base)" : undefined }}>
        {onBackToResults && <button type="button" onClick={onBackToResults} style={{ marginLeft: 14, border: "none", borderRadius: 6, background: "var(--bg-elevated)", color: "var(--fg-base)", padding: "7px 10px", cursor: "pointer", fontWeight: 600 }}>← Back to results</button>}
        <div style={{ flex: 1, minWidth: 0 }}>
        <SongStudioHeader
          title={title}
          setTitle={setTitle}
          artist={artist}
          setArtist={setArtist}
          hasTaggedSections={hasTaggedSections}
          openCueBuilder={openCueBuilder}
          handleSave={handleSave}
          handleClose={handleClose}
        />
        {song.sourceName && <div style={{ padding: "0 16px 8px", fontSize: 11, color: "var(--fg-muted)" }}>Imported from {song.sourceName}{song.sourceUrl ? <> · <a href={song.sourceUrl} target="_blank" rel="noreferrer" style={{ color: "var(--color-primary)" }}>View source</a></> : null}</div>}
        </div>
        </div>

        {/* Main Body: Slides + Canvas + full-song editor */}
        <div style={{ minHeight: 0, minWidth: 0, display: "grid", gridTemplateColumns: "260px minmax(0, 1fr) 340px" }}>
          {/* Left Side Panel: Moveable Slides (PowerPoint Style) */}
          <SongSlideList
            title={title}
            slides={slides}
            activeSlideIndex={activeSlideIndex}
            setActiveSlideIndex={setActiveSlideIndex}
            defaultSongScene={defaultSongScene}
            handleAddSlide={handleAddSlide}
            handleDuplicateSlide={handleDuplicateSlide}
            handleDeleteSlide={handleDeleteSlide}
            handleMoveSlide={handleMoveSlide}
            handleReorder={handleReorder}
            handleSlideLabelChange={handleSlideLabelChange}
          />

          {/* Center Area: Default Template Canvas */}
          <SongPreview
            defaultSongScene={defaultSongScene}
            activeProjectorSlide={activeProjectorSlide}
            currentSlide={currentSlide}
          />

          {/* Right Panel: Full song text and tag-driven slide breaks */}
          <SongTextEditor
            songText={songText}
            handleSongTextChange={handleSongTextChange}
            handleSongTextKeyDown={handleSongTextKeyDown}
          />
        </div>

        {cueModalOpen && (
          <ProjectionCueModal
            cueOrder={cueOrder}
            setCueOrder={setCueOrder}
            setCueModalOpen={setCueModalOpen}
            createProjectionCue={createProjectionCue}
          />
        )}
      </div>
    </div>,
    document.body
  );
}
