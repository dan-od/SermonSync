import type { ProjectorSlide } from "../../types/state";
import { SongSlideCard, type SongSlideCardSharedProps } from "./SongSlideCard";

export function SongSlidesPanel({
  activeSlideIndex,
  title,
  handleAddSlide,
  ...shared
}: SongSlideCardSharedProps & {
  activeSlideIndex: number;
  title: string;
  handleAddSlide: () => void;
}) {
  const { slides, dragOverIndex } = shared;

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
            <SongSlideCard
              key={index}
              {...shared}
              index={index}
              slide={slide}
              isActive={isActive}
              isDragOver={isDragOver}
              projSlide={projSlide}
            />
          );
        })}
      </div>
    </div>
  );
}
