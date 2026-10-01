import { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import type { Song, SongSlide } from "../../stores/songStore";
import { useSongStore } from "../../stores/songStore";
import { useTemplateStore } from "../../stores/templateStore";
import type { ProjectorSlide } from "../../types/state";
import { ProjectionCueDialog } from "./ProjectionCueDialog";
import { SongSlidesPanel } from "./SongSlidesPanel";
import { SongStudioHeader } from "./SongStudioHeader";
import { SongCanvasPreview, SongTextPanel } from "./SongStudioPanels";
import {
  SONG_TAG_PATTERN,
  parseSongText,
  songSlidesEqual,
  songTextFromSlides,
  subTagSuffix,
  type SongTextBlock,
} from "./songStudioText";
import { useSongTextHistory } from "./useSongTextHistory";

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
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [slides, setSlides] = useState<SongSlide[]>(
    song.slides.length > 0 ? song.slides : [{ label: "Verse 1", text: "" }]
  );
  const [songText, setSongText] = useState(() => songTextFromSlides(song.slides));
  const [cueModalOpen, setCueModalOpen] = useState(false);
  const [cueOrder, setCueOrder] = useState("");
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [editingLabelIndex, setEditingLabelIndex] = useState<number | null>(null);
  const [editingLabelValue, setEditingLabelValue] = useState("");

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const saveSong = useSongStore((s) => s.saveSong);
  const templates = useTemplateStore((s) => s.templates);
  const defaults = useTemplateStore((s) => s.defaults);

  // Determine the default song template
  const defaultSongTemplate = useMemo(() => {
    const defaultId = defaults["songs"]?.["widescreen"];
    if (defaultId) {
      const found = templates.find((t) => t.id === defaultId && t.category === "songs");
      if (found) return found;
    }
    const songTemplates = templates.filter((t) => t.category === "songs");
    return songTemplates[0] ?? null;
  }, [defaults, templates]);

  const currentSlide = slides[activeSlideIndex] ?? slides[0] ?? { label: "Verse 1", text: "" };
  const hasTaggedSections = /^\s*\[[^\]\n]+\]\s*$/m.test(songText);

  const handleSave = () => {
    const nextTitle = title.trim() || "Untitled Song";
    const nextArtist = artist.trim() || "Unknown Artist";
    const mainSongChanged = nextTitle !== song.title || nextArtist !== song.artist || !songSlidesEqual(slides, song.slides);

    if (mainSongChanged) {
      saveSong({
        ...song,
        title: nextTitle,
        artist: nextArtist,
        slides,
      });
    }
    onClose();
  };

  const handleClose = () => {
    onClose();
  };

  const { handleSongTextChange, handleSongTextKeyDown } = useSongTextHistory(songText, setSongText);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const nextBlocks = parseSongText(songText);
      setSlides(nextBlocks.length > 0 ? nextBlocks.map(({ label, text }) => ({ label, text })) : [{ label: "Unlabeled", text: "" }]);
      setActiveSlideIndex(0);
    }, 180);
    return () => window.clearTimeout(timeoutId);
  }, [songText]);

  const openCueBuilder = () => {
    const nextTags = Array.from(new Set(parseSongText(songText).map((block) => block.tag).filter((tag): tag is string => Boolean(tag))));
    setCueOrder(nextTags.map((tag) => `[${tag}]`).join("\n"));
    setCueModalOpen(true);
  };

  const createProjectionCue = () => {
    const sourceBlocks = parseSongText(songText);
    const rangesByTag = new Map<string, SongTextBlock[][]>();
    let currentRange: SongTextBlock[] | null = null;
    sourceBlocks.forEach((block) => {
      if (!block.tag) return;
      if (block.explicitTag || !currentRange || currentRange[0]?.tag !== block.tag) {
        currentRange = [];
        const ranges = rangesByTag.get(block.tag) ?? [];
        ranges.push(currentRange);
        rangesByTag.set(block.tag, ranges);
      }
      currentRange.push(block);
    });

    const uniqueRangesByTag = new Map<string, SongTextBlock[][]>();
    rangesByTag.forEach((ranges, tag) => {
      const seenRanges = new Set<string>();
      const uniqueRanges = ranges.filter((range) => {
        const identity = range.map((block) => block.text.trim()).join("\u001f");
        if (seenRanges.has(identity)) return false;
        seenRanges.add(identity);
        return true;
      });
      uniqueRangesByTag.set(tag, uniqueRanges);
    });

    const songTitle = title.trim() || "Untitled Song";
    const cueSlides = cueOrder
      .split("\n")
      .flatMap((line) => {
        const cueItem = line.trim();
        if (!cueItem) return [];
        if (cueItem === "{song_title}") return [{ label: "Song Title", text: songTitle }];

        const tag = cueItem.match(SONG_TAG_PATTERN)?.[1].trim() ?? cueItem;
        const ranges = uniqueRangesByTag.get(tag);
        if (!ranges || ranges.length === 0) return [];
        return ranges.flatMap((range) => range.flatMap((block, index) => {
          if (!block.text.trim()) return [];
          return [{
            label: block.explicitTag ? tag : `${tag} ${subTagSuffix(index)}`,
            text: block.text,
          }];
        }));
    });
    if (cueSlides.length === 0) return;
    onCreateCue?.({ title: songTitle, slides: cueSlides });
    setCueModalOpen(false);
  };

  const handleAddSlide = () => {
    const newSlide: SongSlide = {
      label: `Verse ${slides.length + 1}`,
      text: "",
    };
    const nextSlides = [...slides, newSlide];
    setSlides(nextSlides);
    setActiveSlideIndex(nextSlides.length - 1);
  };

  const handleDuplicateSlide = (index: number) => {
    const target = slides[index];
    if (!target) return;
    const duplicated: SongSlide = {
      label: `${target.label} (Copy)`,
      text: target.text,
    };
    const nextSlides = [...slides];
    nextSlides.splice(index + 1, 0, duplicated);
    setSlides(nextSlides);
    setActiveSlideIndex(index + 1);
  };

  const handleDeleteSlide = (index: number) => {
    if (slides.length <= 1) return;
    const nextSlides = slides.filter((_, i) => i !== index);
    setSlides(nextSlides);
    if (activeSlideIndex >= nextSlides.length) {
      setActiveSlideIndex(Math.max(0, nextSlides.length - 1));
    }
  };

  const handleMoveSlide = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= slides.length) return;
    const reordered = [...slides];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    setSlides(reordered);
    if (activeSlideIndex === index) {
      setActiveSlideIndex(targetIndex);
    } else if (activeSlideIndex === targetIndex) {
      setActiveSlideIndex(index);
    }
  };

  const handleReorder = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= slides.length || toIndex < 0 || toIndex >= slides.length) return;
    const reordered = [...slides];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setSlides(reordered);
    if (activeSlideIndex === fromIndex) {
      setActiveSlideIndex(toIndex);
    }
  };

  const handleSlideLabelChange = (index: number, label: string) => {
    setSlides((curr) =>
      curr.map((slide, i) => (i === index ? { ...slide, label } : slide))
    );
  };

  // Convert current slide to ProjectorSlide for preview rendering
  const activeProjectorSlide: ProjectorSlide = {
    reference: {
      book: title || "Song Title",
      chapter: 1,
      verse: activeSlideIndex + 1,
    },
    text: currentSlide.text,
    version: "SONG",
  };

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
          <SongSlidesPanel
            activeSlideIndex={activeSlideIndex}
            title={title}
            handleAddSlide={handleAddSlide}
            slides={slides}
            defaultSongTemplate={defaultSongTemplate}
            draggedIndex={draggedIndex}
            dragOverIndex={dragOverIndex}
            setDraggedIndex={setDraggedIndex}
            setDragOverIndex={setDragOverIndex}
            handleReorder={handleReorder}
            setActiveSlideIndex={setActiveSlideIndex}
            editingLabelIndex={editingLabelIndex}
            editingLabelValue={editingLabelValue}
            setEditingLabelIndex={setEditingLabelIndex}
            setEditingLabelValue={setEditingLabelValue}
            handleSlideLabelChange={handleSlideLabelChange}
            handleMoveSlide={handleMoveSlide}
            handleDuplicateSlide={handleDuplicateSlide}
            handleDeleteSlide={handleDeleteSlide}
          />

          {/* Center Area: Default Template Canvas */}
          <SongCanvasPreview
            defaultSongTemplate={defaultSongTemplate}
            activeProjectorSlide={activeProjectorSlide}
            currentSlide={currentSlide}
          />

          {/* Right Panel: Full song text and tag-driven slide breaks */}
          <SongTextPanel
            songText={songText}
            handleSongTextChange={handleSongTextChange}
            handleSongTextKeyDown={handleSongTextKeyDown}
          />
        </div>

        {cueModalOpen && (
          <ProjectionCueDialog
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
