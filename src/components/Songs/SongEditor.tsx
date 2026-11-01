import { useState } from "react";
import { type SongSlide } from "../../stores/songStore";
import { type TemplateScene } from "../../types/templates";
import { type ProjectorSlide } from "../../types/state";
import { TemplateSceneOverlay } from "../ProjectorView";
import { tagColor } from "./tagColor";
import { IconButton } from "./SongIconButton";

export function SongSlideList({
  title,
  slides,
  activeSlideIndex,
  setActiveSlideIndex,
  defaultSongScene,
  handleAddSlide,
  handleDuplicateSlide,
  handleDeleteSlide,
  handleMoveSlide,
  handleReorder,
  handleSlideLabelChange,
}: {
  title: string;
  slides: SongSlide[];
  activeSlideIndex: number;
  setActiveSlideIndex: (index: number) => void;
  defaultSongScene: TemplateScene | null;
  handleAddSlide: () => void;
  handleDuplicateSlide: (index: number) => void;
  handleDeleteSlide: (index: number) => void;
  handleMoveSlide: (index: number, direction: "up" | "down") => void;
  handleReorder: (fromIndex: number, toIndex: number) => void;
  handleSlideLabelChange: (index: number, label: string) => void;
}) {
  const [editingLabelIndex, setEditingLabelIndex] = useState<number | null>(null);
  const [editingLabelValue, setEditingLabelValue] = useState("");

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  return (
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
        className="studio-scroll-pane"
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
                {defaultSongScene ? (
                  <TemplateSceneOverlay
                    scene={defaultSongScene}
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
  );
}

export function SongTextEditor({
  songText,
  handleSongTextChange,
  handleSongTextKeyDown,
}: {
  songText: string;
  handleSongTextChange: (value: string) => void;
  handleSongTextKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  return (
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
        className="studio-scroll-pane"
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
  );
}
