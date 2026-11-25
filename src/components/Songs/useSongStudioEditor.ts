import { useEffect, useRef, useState, useMemo } from "react";
import { getSongLanguageVariant, getSongLanguageVariants, type Song, type SongSlide, useSongStore } from "../../stores/songStore";
import { useTemplateStore } from "../../stores/templateStore";
import { projectionScene } from "../../lib/projectionScene";
import { type ProjectorSlide } from "../../types/state";
import { parseSongText, songTextFromSlides, songSlidesEqual } from "./songText";
import { buildProjectionCueSlides } from "./songEditorUtils";

export const SONG_EDITOR_LANGUAGES = [
  "Hausa",
  "Yoruba",
  "Igbo",
  "Spanish",
  "Ikwerre",
  "Mandarin Chinese",
  "Hindi",
  "English",
] as const;

function variantHasLyrics(slides: SongSlide[]): boolean {
  return slides.some((slide) => slide.text.trim().length > 0);
}

export function useSongStudioEditor({ song, initialLanguage, onClose, onCreateCue, onDirtyChange, onLanguageChange }: {
  song: Song;
  initialLanguage?: string;
  onClose: () => void;
  onCreateCue?: (cue: { title: string; slides: SongSlide[] }) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onLanguageChange?: (language: string) => void;
}) {
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [languageVariants, setLanguageVariants] = useState(() => getSongLanguageVariants(song));
  const [activeLanguage, setActiveLanguage] = useState(() => getSongLanguageVariant(song, initialLanguage).language);
  const [slides, setSlides] = useState<SongSlide[]>(() => {
    const initialSlides = getSongLanguageVariant(song, initialLanguage).slides;
    return variantHasLyrics(initialSlides) ? initialSlides : [];
  });
  const [songText, setSongText] = useState(() => {
    const initialSlides = getSongLanguageVariant(song, initialLanguage).slides;
    return variantHasLyrics(initialSlides) ? songTextFromSlides(initialSlides) : "";
  });
  const [cueModalOpen, setCueModalOpen] = useState(false);
  const [cueOrder, setCueOrder] = useState("");
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const songTextHistoryRef = useRef<{ past: string[]; future: string[] }>({ past: [], future: [] });
  const songTextCheckpointRef = useRef(songText);
  const songTextCheckpointTimeoutRef = useRef<number | null>(null);

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

  const originalVariants = getSongLanguageVariants(song);
  const variantsMatchOriginal = languageVariants.length === originalVariants.length
    && languageVariants.every((variant, index) => {
      const original = originalVariants[index];
      return original?.language === variant.language && songSlidesEqual(variant.slides, original.slides);
    });
  const activeTextChanged = songText !== songTextFromSlides(getSongLanguageVariant(song, activeLanguage).slides);

  useEffect(() => {
    onDirtyChange?.(title !== song.title || artist !== song.artist || !variantsMatchOriginal || activeTextChanged);
  }, [activeTextChanged, artist, onDirtyChange, song.artist, song.title, title, variantsMatchOriginal]);

  const getCurrentLanguageSlides = () => {
    if (songText === songTextFromSlides(slides)) return slides;
    const blocks = parseSongText(songText);
    return blocks.map(({ label, text }) => ({ label, text }));
  };

  const replaceActiveLanguageSlides = (nextSlides: SongSlide[]) => {
    setSlides(nextSlides);
    setLanguageVariants((current) => current.map((variant) => (
      variant.language.toLowerCase() === activeLanguage.toLowerCase()
        ? { ...variant, slides: nextSlides }
        : variant
    )));
    setSongText(songTextFromSlides(nextSlides));
  };

  const resetSongTextHistory = (nextText: string) => {
    if (songTextCheckpointTimeoutRef.current) {
      window.clearTimeout(songTextCheckpointTimeoutRef.current);
      songTextCheckpointTimeoutRef.current = null;
    }
    songTextHistoryRef.current = { past: [], future: [] };
    songTextCheckpointRef.current = nextText;
  };

  const switchLanguage = (language: string) => {
    if (language === activeLanguage) return;

    let nextVariants = languageVariants.map((variant) => (
      variant.language === activeLanguage
        ? { ...variant, slides: getCurrentLanguageSlides() }
        : variant
    ));
    let target = nextVariants.find((variant) => variant.language === language);
    if (!target && SONG_EDITOR_LANGUAGES.some((knownLanguage) => knownLanguage === language)) {
      target = { language, slides: [] };
      nextVariants = [...nextVariants, target];
    }
    if (!target) return;

    const nextSlides = target.slides;
    const nextText = songTextFromSlides(nextSlides);
    setLanguageVariants(nextVariants);
    setActiveLanguage(language);
    setSlides(nextSlides);
    setSongText(nextText);
    setActiveSlideIndex(0);
    resetSongTextHistory(nextText);
    onLanguageChange?.(language);
  };

  const handleSave = () => {
    const nextTitle = title.trim() || "Untitled Song";
    const nextArtist = artist.trim() || "Unknown Artist";
    const nextVariants = languageVariants.map((variant) => (
      variant.language === activeLanguage
        ? { ...variant, slides: getCurrentLanguageSlides() }
        : variant
    )).filter((variant) => variantHasLyrics(variant.slides));
    const existingDefaultLanguage = song.defaultLanguage ?? getSongLanguageVariant(song).language;
    const defaultLanguage = nextVariants.some((variant) => variant.language === existingDefaultLanguage)
      ? existingDefaultLanguage
      : nextVariants[0]?.language ?? existingDefaultLanguage;
    const defaultSlides = nextVariants.find((variant) => variant.language === defaultLanguage)?.slides ?? [];
    const mainSongChanged = nextTitle !== song.title || nextArtist !== song.artist || !variantsMatchOriginal || activeTextChanged;

    if (mainSongChanged) {
      saveSong({
        ...song,
        title: nextTitle,
        artist: nextArtist,
        defaultLanguage,
        languageVariants: nextVariants,
        slides: defaultSlides,
      });
    }
    onClose();
  };

  const handleClose = () => {
    onClose();
  };

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
      const nextSlides = nextBlocks.map(({ label, text }) => ({ label, text }));
      setSlides((current) => songSlidesEqual(current, nextSlides) ? current : nextSlides);
      setLanguageVariants((current) => {
        const activeVariant = current.find(
          (variant) => variant.language.toLowerCase() === activeLanguage.toLowerCase(),
        );
        if (!activeVariant || songSlidesEqual(activeVariant.slides, nextSlides)) return current;

        return current.map((variant) => (
          variant.language.toLowerCase() === activeLanguage.toLowerCase()
            ? { ...variant, slides: nextSlides }
            : variant
        ));
      });
      setActiveSlideIndex((current) => Math.min(current, Math.max(0, nextSlides.length - 1)));
    }, 180);
    return () => window.clearTimeout(timeoutId);
  }, [activeLanguage, songText]);

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
    replaceActiveLanguageSlides(nextSlides);
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
    replaceActiveLanguageSlides(nextSlides);
    setActiveSlideIndex(index + 1);
  };

  const handleDeleteSlide = (index: number) => {
    if (slides.length <= 1) return;
    const nextSlides = slides.filter((_, i) => i !== index);
    replaceActiveLanguageSlides(nextSlides);
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
    replaceActiveLanguageSlides(reordered);
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
    replaceActiveLanguageSlides(reordered);
    if (activeSlideIndex === fromIndex) {
      setActiveSlideIndex(toIndex);
    }
  };

  const handleSlideLabelChange = (index: number, label: string) => {
    replaceActiveLanguageSlides(slides.map((slide, i) => (i === index ? { ...slide, label } : slide)));
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
    activeLanguage,
    availableLanguages: [
      ...SONG_EDITOR_LANGUAGES,
      ...languageVariants
        .map((variant) => variant.language)
        .filter((language) => !SONG_EDITOR_LANGUAGES.some((knownLanguage) => knownLanguage === language)),
    ],
    switchLanguage,
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
