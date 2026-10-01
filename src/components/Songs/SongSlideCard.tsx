import type { Dispatch, SetStateAction } from "react";
import type { SongSlide } from "../../stores/songStore";
import { TemplateSceneOverlay } from "../ProjectorView";
import { projectionScene } from "../../lib/projectionScene";
import type { ProjectorSlide } from "../../types/state";
import type { TemplateCanvasTheme } from "../../types/templates";
import { tagColor } from "./tagColor";

/** Slide-list state and actions shared by the slides panel and each slide card. */
export interface SongSlideCardSharedProps {
  slides: SongSlide[];
  defaultSongTemplate: TemplateCanvasTheme | null;
  draggedIndex: number | null;
  dragOverIndex: number | null;
  setDraggedIndex: Dispatch<SetStateAction<number | null>>;
  setDragOverIndex: Dispatch<SetStateAction<number | null>>;
  handleReorder: (fromIndex: number, toIndex: number) => void;
  setActiveSlideIndex: Dispatch<SetStateAction<number>>;
  editingLabelIndex: number | null;
  editingLabelValue: string;
  setEditingLabelIndex: Dispatch<SetStateAction<number | null>>;
  setEditingLabelValue: Dispatch<SetStateAction<string>>;
  handleSlideLabelChange: (index: number, label: string) => void;
  handleMoveSlide: (index: number, direction: "up" | "down") => void;
  handleDuplicateSlide: (index: number) => void;
  handleDeleteSlide: (index: number) => void;
}

export function SongSlideCard({
  index,
  slide,
  isActive,
  isDragOver,
  projSlide,
  slides,
  defaultSongTemplate,
  draggedIndex,
  dragOverIndex,
  setDraggedIndex,
  setDragOverIndex,
  handleReorder,
  setActiveSlideIndex,
  editingLabelIndex,
  editingLabelValue,
  setEditingLabelIndex,
  setEditingLabelValue,
  handleSlideLabelChange,
  handleMoveSlide,
  handleDuplicateSlide,
  handleDeleteSlide,
}: SongSlideCardSharedProps & {
  index: number;
  slide: SongSlide;
  isActive: boolean;
  isDragOver: boolean;
  projSlide: ProjectorSlide;
}) {
  return (
    <div
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
