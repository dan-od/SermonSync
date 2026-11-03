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
}


export function SongStudioModal({ open, song, onClose, onCreateCue }: SongStudioModalProps) {
  if (!open || !song) return null;

  return (
    <SongStudioContent
      song={song}
      onClose={onClose}
      onCreateCue={onCreateCue}
    />
  );
}

function SongStudioContent({ song, onClose, onCreateCue }: Omit<SongStudioModalProps, "open" | "song"> & { song: Song }) {
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
  } = useSongStudioEditor({ song, onClose, onCreateCue });

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
        display: "flex",
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
