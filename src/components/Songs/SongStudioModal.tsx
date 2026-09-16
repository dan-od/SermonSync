import { useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import type { Song, SongSlide } from "../../stores/songStore";
import { useSongStore } from "../../stores/songStore";
import { useTemplateStore } from "../../stores/templateStore";
import { TemplateSceneOverlay } from "../ProjectorView";
import { projectionScene } from "../../lib/projectionScene";
import type { ProjectorSlide } from "../../types/state";
import { tagColor } from "./tagColor";

interface SongStudioModalProps {
  open: boolean;
  song: Song | null;
  onClose: () => void;
  onCreateCue?: (cue: { title: string; slides: SongSlide[] }) => void;
}

interface SongTextBlock {
  label: string;
  text: string;
  tag: string | null;
  explicitTag: string | null;
}

const SONG_TAG_PATTERN = /^\[([^\]]+)\]\s*$/;

function subTagSuffix(index: number): string {
  let value = index;
  let suffix = "";
  do {
    suffix = String.fromCharCode(97 + (value % 26)) + suffix;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return suffix;
}

function parseSongText(value: string): SongTextBlock[] {
  let currentTag: string | null = null;
  return value
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.trim().split("\n");
      const tagMatch = lines[0]?.match(SONG_TAG_PATTERN);
      const explicitTag = tagMatch?.[1].trim() || null;
      if (explicitTag) currentTag = explicitTag;
      const text = (tagMatch ? lines.slice(1) : lines).join("\n").trim();
      return {
        label: currentTag ?? "Unlabeled",
        text,
        tag: currentTag,
        explicitTag,
      };
    })
    .filter((block) => block.tag || block.text);
}

function songTextFromSlides(slides: SongSlide[]): string {
  return slides.map((slide) => `[${slide.label}]\n${slide.text}`).join("\n\n");
}

function songSlidesEqual(first: SongSlide[], second: SongSlide[]): boolean {
  return first.length === second.length && first.every((slide, index) => {
    const other = second[index];
    return other?.label === slide.label && other.text === slide.text;
  });
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
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            borderBottom: "1px solid var(--border-base)",
            padding: "12px 18px",
            background: "var(--bg-surface)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: 1 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ color: "var(--fg-base)", fontWeight: 700, fontSize: "14px" }}>
                Song Studio
              </span>
              <span style={{ color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.06em" }}>
                EDIT SONG & SLIDES
              </span>
            </div>

            {/* Title Input */}
            <input
              type="text"
              value={title}
              placeholder="Song Title"
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Song title"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-base)",
                borderRadius: "6px",
                padding: "6px 10px",
                color: "var(--fg-base)",
                fontSize: "13px",
                fontWeight: 600,
                outline: "none",
                width: "220px",
              }}
            />

            {/* Artist Input */}
            <input
              type="text"
              value={artist}
              placeholder="Artist"
              onChange={(e) => setArtist(e.target.value)}
              aria-label="Artist name"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-base)",
                borderRadius: "6px",
                padding: "6px 10px",
                color: "var(--fg-muted)",
                fontSize: "13px",
                outline: "none",
                width: "180px",
              }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              type="button"
              onClick={openCueBuilder}
              disabled={!hasTaggedSections}
              style={{
                border: "1px solid var(--color-primary)",
                background: "var(--color-primary-muted)",
                color: "var(--color-primary)",
                borderRadius: "var(--radius-sm)",
                padding: "8px 12px",
                fontWeight: 600,
                fontSize: "12px",
                cursor: !hasTaggedSections ? "not-allowed" : "pointer",
                opacity: !hasTaggedSections ? 0.5 : 1,
                transition: "background 120ms ease, color 120ms ease",
              }}
              onMouseEnter={(event) => {
                if (hasTaggedSections) {
                  event.currentTarget.style.background = "var(--color-primary)";
                  event.currentTarget.style.color = "var(--fg-on-accent)";
                }
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = "var(--color-primary-muted)";
                event.currentTarget.style.color = "var(--color-primary)";
              }}
            >
              Create projection cue
            </button>
            <button
              type="button"
              onClick={handleSave}
              style={{
                border: "none",
                background: "var(--color-primary)",
                color: "var(--fg-on-accent)",
                borderRadius: "8px",
                padding: "8px 16px",
                fontWeight: 700,
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={handleClose}
              style={{
                border: "none",
                background: "var(--bg-elevated)",
                color: "var(--fg-base)",
                borderRadius: "6px",
                width: "30px",
                height: "30px",
                cursor: "pointer",
                fontSize: "16px",
                display: "grid",
                placeItems: "center",
              }}
              title="Close without saving"
              aria-label="Close without saving"
            >
              ×
            </button>
          </div>
        </header>

        {/* Main Body: Slides + Canvas + full-song editor */}
        <div style={{ minHeight: 0, minWidth: 0, display: "grid", gridTemplateColumns: "260px minmax(0, 1fr) 340px" }}>
          {/* Left Side Panel: Moveable Slides (PowerPoint Style) */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              height: "100%",
              minHeight: 0,
              background: "var(--bg-surface)",
              borderRight: "1px solid var(--border-base)",
              overflow: "hidden",
            }}
          >
            {/* Header with '+' button */}
            <div
              style={{
                padding: "10px 14px",
                borderBottom: "1px solid var(--border-base)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
                background: "var(--bg-surface)",
              }}
            >
              <span style={{ fontWeight: 700, fontSize: "13px", color: "var(--fg-base)" }}>Slides</span>
              <button
                type="button"
                onClick={handleAddSlide}
                aria-label="Add slide"
                title="Add new slide (+)"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "26px",
                  height: "26px",
                  border: "1px solid var(--border-base)",
                  borderRadius: "6px",
                  background: "var(--bg-elevated)",
                  color: "var(--fg-base)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "18px",
                  lineHeight: 1,
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "background 120ms ease, border-color 120ms ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--color-primary-muted)";
                  e.currentTarget.style.borderColor = "var(--color-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--bg-elevated)";
                  e.currentTarget.style.borderColor = "var(--border-base)";
                }}
              >
                +
              </button>
            </div>

            {/* Slides List */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                padding: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              {slides.map((slide, index) => {
                const isActive = index === activeSlideIndex;
                const isDragOver = dragOverIndex === index;
                const projSlide: ProjectorSlide = {
                  reference: { book: title || "Song", chapter: 1, verse: index + 1 },
                  text: slide.text,
                  version: "SONG",
                };

                return (
                  <div
                    key={index}
                    draggable
                    onDragStart={(e) => {
                      setDraggedIndex(index);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverIndex(index);
                    }}
                    onDragLeave={() => {
                      if (dragOverIndex === index) setDragOverIndex(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedIndex !== null && draggedIndex !== index) {
                        handleReorder(draggedIndex, index);
                      }
                      setDraggedIndex(null);
                      setDragOverIndex(null);
                    }}
                    onClick={() => setActiveSlideIndex(index)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      padding: "8px",
                      borderRadius: "8px",
                      border: isActive
                        ? `2px solid ${tagColor(slide.label)}`
                        : isDragOver
                          ? "2px dashed var(--color-primary)"
                          : "1px solid var(--border-base)",
                      background: isActive ? "var(--color-primary-muted)" : "var(--bg-base)",
                      cursor: "pointer",
                      position: "relative",
                      transition: "border-color 120ms ease, background 120ms ease",
                      boxShadow: isActive ? "var(--shadow-sm)" : "none",
                    }}
                  >
                    {/* Header Controls */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, flex: 1 }}>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "10px",
                            fontWeight: 700,
                            color: "var(--fg-on-accent)",
                            background: tagColor(slide.label),
                            padding: "1px 5px",
                            borderRadius: "4px",
                            flexShrink: 0,
                          }}
                        >
                          {index + 1}
                        </span>
                        {editingLabelIndex === index ? (
                          <input
                            autoFocus
                            value={editingLabelValue}
                            onChange={(e) => setEditingLabelValue(e.target.value)}
                            onBlur={() => {
                              if (editingLabelValue.trim()) {
                                handleSlideLabelChange(index, editingLabelValue.trim());
                              }
                              setEditingLabelIndex(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                if (editingLabelValue.trim()) {
                                  handleSlideLabelChange(index, editingLabelValue.trim());
                                }
                                setEditingLabelIndex(null);
                              }
                              if (e.key === "Escape") setEditingLabelIndex(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              width: "100%",
                              border: "1px solid var(--color-primary)",
                              borderRadius: "4px",
                              background: "var(--bg-surface)",
                              color: "var(--fg-base)",
                              fontSize: "11px",
                              fontWeight: 600,
                              padding: "1px 4px",
                            }}
                          />
                        ) : (
                          <span
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setEditingLabelIndex(index);
                              setEditingLabelValue(slide.label);
                            }}
                            title="Double-click to rename"
                            style={{
                              fontSize: "11px",
                              fontWeight: isActive ? 700 : 500,
                              color: isActive ? "var(--fg-base)" : "var(--fg-muted)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {slide.label}
                          </span>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: "flex", alignItems: "center", gap: "2px", flexShrink: 0 }}>
                        <IconButton
                          title="Move up"
                          disabled={index === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveSlide(index, "up");
                          }}
                        >
                          ↑
                        </IconButton>
                        <IconButton
                          title="Move down"
                          disabled={index === slides.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveSlide(index, "down");
                          }}
                        >
                          ↓
                        </IconButton>
                        <IconButton
                          title="Duplicate slide"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicateSlide(index);
                          }}
                        >
                          ⧉
                        </IconButton>
                        <IconButton
                          title="Delete slide"
                          disabled={slides.length <= 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSlide(index);
                          }}
                          danger
                        >
                          ×
                        </IconButton>
                      </div>
                    </div>

                    {/* 16:9 Thumbnail Snapshot */}
                    <div
                      style={{
                        width: "100%",
                        aspectRatio: "16 / 9",
                        position: "relative",
                        overflow: "hidden",
                        borderRadius: "5px",
                        border: "1px solid var(--border-base)",
                        background: "var(--bg-surface)",
                      }}
                    >
                      {defaultSongTemplate ? (
                        <TemplateSceneOverlay
                          scene={projectionScene(defaultSongTemplate)}
                          slide={projSlide}
                          category="songs"
                          fitToContainer
                          isThumbnail
                        />
                      ) : (
                        <div
                          style={{
                            width: "100%",
                            height: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "6px",
                            textAlign: "center",
                            color: "var(--fg-muted)",
                            fontSize: "10px",
                          }}
                        >
                          {slide.text || slide.label}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Center Area: Default Template Canvas */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              height: "100%",
              minHeight: 0,
              background: "var(--bg-base)",
              overflow: "hidden",
            }}
          >
            {/* Top Canvas Preview Container */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                background: "radial-gradient(circle at center, rgba(30, 30, 42, 0.6) 0%, rgba(15, 15, 22, 0.95) 100%)",
              }}
            >
              <div
                style={{
                  width: "100%",
                  maxHeight: "100%",
                  aspectRatio: "16 / 9",
                  position: "relative",
                  borderRadius: "8px",
                  overflow: "hidden",
                  border: "1px solid var(--border-base)",
                  boxShadow: "var(--shadow-lg)",
                }}
              >
                {defaultSongTemplate ? (
                  <TemplateSceneOverlay
                    scene={projectionScene(defaultSongTemplate)}
                    slide={activeProjectorSlide}
                    category="songs"
                    fitToContainer
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "linear-gradient(135deg, #181824 0%, #0d0d14 100%)",
                      color: "#ffffff",
                      fontSize: "24px",
                      textAlign: "center",
                      padding: "30px",
                    }}
                  >
                    {currentSlide.text || "No text for this slide yet"}
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Right Panel: Full song text and tag-driven slide breaks */}
          <aside
            style={{
              minWidth: 0,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              borderLeft: "1px solid var(--border-base)",
              background: "var(--bg-surface)",
            }}
          >
            <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border-base)" }}>
              <div style={{ color: "var(--fg-base)", fontSize: "13px", fontWeight: 700 }}>Song text</div>
              <div style={{ marginTop: "4px", color: "var(--fg-subtle)", fontSize: "11px", lineHeight: 1.4 }}>
                Add tags manually. A blank line splits the next visual slide and keeps the last tag.
              </div>
            </div>
            <textarea
              value={songText}
              aria-label="Full song text"
              placeholder="[Verse 1]\nAmazing grace...\n\n[Chorus]\nHow sweet the sound..."
              onChange={(event) => handleSongTextChange(event.target.value)}
              onKeyDown={handleSongTextKeyDown}
              style={{
                flex: 1,
                width: "100%",
                minHeight: 0,
                border: "none",
                borderRadius: 0,
                background: "var(--bg-base)",
                color: "var(--fg-base)",
                padding: "14px",
                fontFamily: "var(--font-sans)",
                fontSize: "13px",
                lineHeight: 1.55,
                resize: "none",
                outline: "none",
              }}
            />
          </aside>
        </div>

        {cueModalOpen && (
          <div
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setCueModalOpen(false);
            }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1300,
              display: "grid",
              placeItems: "center",
              padding: 20,
              background: "var(--overlay-backdrop)",
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="projection-cue-title"
              style={{
                width: "min(460px, 94vw)",
                maxHeight: "min(620px, 88vh)",
                overflow: "auto",
                padding: 20,
                borderRadius: "var(--radius-lg)",
                background: "var(--bg-surface)",
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <h2 id="projection-cue-title" style={{ margin: 0, color: "var(--fg-base)", fontSize: 17 }}>
                Create projection cue
              </h2>
              <p style={{ margin: "8px 0 16px", color: "var(--fg-muted)", fontSize: 12, lineHeight: 1.5 }}>
                Enter one manually assigned tag per line. Each tag includes the slides until the next tag; unlabeled slides receive a sub-tag, and repeated identical ranges in the song are treated as one sequence. Remove sections or repeat tags to build the cue in your own order. Use {"{song_title}"} when the cue needs the song title.
              </p>
              <textarea
                value={cueOrder}
                aria-label="Projection cue tag order"
                placeholder="[Verse 1]\n[Chorus]\n[Verse 2]\n[Chorus]"
                onChange={(event) => setCueOrder(event.target.value)}
                style={{
                  width: "100%",
                  minHeight: 220,
                  boxSizing: "border-box",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-base)",
                  color: "var(--fg-base)",
                  padding: "12px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  lineHeight: 1.6,
                  resize: "vertical",
                  outline: "none",
                }}
              />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                  {cueOrder.split("\n").map((line, index) => {
                    const tag = line.trim().match(SONG_TAG_PATTERN)?.[1].trim() ?? line.trim();
                    if (!tag) return null;
                    return (
                      <span
                        key={`${tag}-${index}`}
                        style={{
                          padding: "3px 7px",
                          borderRadius: "var(--radius-sm)",
                          background: tagColor(tag),
                          color: "var(--fg-on-accent)",
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {tag}
                      </span>
                    );
                  })}
                </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
                <button
                  type="button"
                  onClick={() => setCueModalOpen(false)}
                  style={{
                    padding: "8px 13px",
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
                  onClick={createProjectionCue}
                  disabled={!cueOrder.trim()}
                  style={{
                    padding: "8px 13px",
                    border: "none",
                    borderRadius: 6,
                    background: "var(--color-primary)",
                    color: "var(--fg-on-accent)",
                    cursor: cueOrder.trim() ? "pointer" : "not-allowed",
                    fontSize: 12,
                    fontWeight: 600,
                    opacity: cueOrder.trim() ? 1 : 0.5,
                  }}
                >
                  Create cue
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function IconButton({
  children,
  title,
  disabled,
  danger,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        border: "none",
        background: "transparent",
        color: danger ? "var(--color-error)" : "var(--fg-subtle)",
        borderRadius: "4px",
        width: "18px",
        height: "18px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.3 : 0.8,
        fontSize: "11px",
        padding: 0,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.opacity = "1";
          e.currentTarget.style.background = danger ? "rgba(255, 75, 96, 0.15)" : "var(--bg-elevated)";
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.opacity = "0.8";
          e.currentTarget.style.background = "transparent";
        }
      }}
    >
      {children}
    </button>
  );
}
