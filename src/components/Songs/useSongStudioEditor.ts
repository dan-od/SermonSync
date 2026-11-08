import { useEffect, useRef, useState, useMemo } from "react";
import { type Song, type SongSlide, useSongStore } from "../../stores/songStore";
import { useTemplateStore } from "../../stores/templateStore";
import { projectionScene } from "../../lib/projectionScene";
import { type ProjectorSlide } from "../../types/state";
import { parseSongText, songTextFromSlides, songSlidesEqual } from "./songText";
import { buildProjectionCueSlides } from "./songEditorUtils";

export function useSongStudioEditor({ song, onClose, onCreateCue, onDirtyChange }: {
  song: Song;
  onClose: () => void;
  onCreateCue?: (cue: { title: string; slides: SongSlide[] }) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [slides, setSlides] = useState<SongSlide[]>(
    song.slides.length > 0 ? song.slides : [{ label: "Verse 1", text: "" }]
  );
  const [songText, setSongText] = useState(() => songTextFromSlides(song.slides));
  const [cueModalOpen, setCueModalOpen] = useState(false);
  const [cueOrder, setCueOrder] = useState("");
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);

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

  // Computed once per template instead of once per slide/canvas render (thumbnails + main preview all share it).
  const defaultSongScene = useMemo(
    () => (defaultSongTemplate ? projectionScene(defaultSongTemplate) : null),
    [defaultSongTemplate],
  );

  const currentSlide = slides[activeSlideIndex] ?? slides[0] ?? { label: "Verse 1", text: "" };
  const hasTaggedSections = /^\s*\[[^\]\n]+\]\s*$/m.test(songText);

  useEffect(() => {
    onDirtyChange?.(title !== song.title || artist !== song.artist || songText !== songTextFromSlides(song.slides) || !songSlidesEqual(slides, song.slides));
  }, [artist, onDirtyChange, slides, song.artist, song.slides, song.title, songText, title]);

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

  // Coarse-grained undo/redo stacks for the song text editor, checkpointed on typing pauses.
  const songTextHistoryRef = useRef<{ past: string[]; future: string[] }>({ past: [], future: [] });
  const songTextCheckpointRef = useRef(songText);
  const songTextCheckpointTimeoutRef = useRef<number | null>(null);

  const commitSongTextCheckpoint = (value: string) => {
    if (value === songTextCheckpointRef.current) return;
    songTextHistoryRef.current.past.push(songTextCheckpointRef.current);
    songTextHistoryRef.current.future = [];
    songTextCheckpointRef.current = value;
  };

  const handleSongTextChange = (value: string) => {
    setSongText(value);
    if (songTextCheckpointTimeoutRef.current) window.clearTimeout(songTextCheckpointTimeoutRef.current);
    songTextCheckpointTimeoutRef.current = window.setTimeout(() => commitSongTextCheckpoint(value), 400);
  };

  const flushSongTextCheckpoint = () => {
    if (songTextCheckpointTimeoutRef.current) {
      window.clearTimeout(songTextCheckpointTimeoutRef.current);
      songTextCheckpointTimeoutRef.current = null;
      commitSongTextCheckpoint(songText);
    }
  };

  const handleSongTextUndo = () => {
    flushSongTextCheckpoint();
    const previous = songTextHistoryRef.current.past.pop();
    if (previous === undefined) return;
    songTextHistoryRef.current.future.push(songTextCheckpointRef.current);
    songTextCheckpointRef.current = previous;
    setSongText(previous);
  };

  const handleSongTextRedo = () => {
    flushSongTextCheckpoint();
    const next = songTextHistoryRef.current.future.pop();
    if (next === undefined) return;
    songTextHistoryRef.current.past.push(songTextCheckpointRef.current);
    songTextCheckpointRef.current = next;
    setSongText(next);
  };

  const handleSongTextKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (event.key === "z" || event.key === "Z") {
      event.preventDefault();
      handleSongTextUndo();
    } else if (event.key === "r" || event.key === "R") {
      event.preventDefault();
      handleSongTextRedo();
    }
  };

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
    const songTitle = title.trim() || "Untitled Song";
    const cueSlides = buildProjectionCueSlides(songText, cueOrder, songTitle);
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

  return {
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
  };
}
