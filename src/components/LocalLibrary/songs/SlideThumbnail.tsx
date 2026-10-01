import type { ProjectorSlide } from "../../../types/state";

// ─── Songs tab ────────────────────────────────────────────────────────────────

export function SlideThumbnail({
  slide,
  label,
  isPreview,
  isLive,
  isSelected,
  onClick,
  onDoubleClick,
  onFocus,
  onKeyDown,
}: {
  slide: ProjectorSlide;
  label: string;
  isPreview: boolean;
  isLive: boolean;
  isSelected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}) {
  const activeColor = isSelected
    ? "var(--color-primary)"
    : isLive
      ? "var(--color-success)"
      : isPreview
        ? "var(--color-primary)"
    : "transparent";

  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        textAlign: "left",
        width: "100%",
        aspectRatio: "16 / 9",
        padding: "var(--space-2)",
        background: "linear-gradient(180deg, rgba(16, 20, 44, 0.95), rgba(8, 9, 18, 1))",
        border: isSelected
          ? `2px solid ${activeColor}`
          : "1px solid var(--border-base)",
        borderRadius: "var(--radius-md)",
        cursor: "pointer",
        outline: "none",
        position: "relative",
        overflow: "hidden",
        boxShadow: "var(--shadow-sm)",
        transition: "border-color 120ms ease, transform 120ms ease",
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.borderColor = "var(--fg-subtle)";
        }
        e.currentTarget.style.transform = "scale(1.02)";
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.borderColor = "var(--border-base)";
        }
        e.currentTarget.style.transform = "scale(1)";
      }}
    >
      {/* Slide label */}
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "9px",
          fontWeight: 700,
          color: isSelected ? "var(--color-primary)" : isLive ? "var(--color-success)" : isPreview ? "var(--color-primary)" : "#aeb8d0",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>

      {/* Slide text preview */}
      <span
        style={{
          color: "#f4f7ff",
          fontSize: "10px",
          lineHeight: "1.3",
          fontFamily: "Georgia, serif",
          margin: "var(--space-1) 0",
          flex: 1,
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {slide.text}
      </span>

      {/* Small indicator at the bottom right */}
      {isLive && isSelected && (
        <span
          style={{
            position: "absolute",
            bottom: "4px",
            right: "6px",
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: "var(--color-success)",
          }}
        />
      )}
    </button>
  );
}
