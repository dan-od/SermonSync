import { useState } from "react";
import { tableHeaderCellStyle } from "../styles";

export function ScripturePane({
  title,
  children,
  width,
  showDivider = true,
  action,
}: {
  title: string;
  children: React.ReactNode;
  width?: string;
  showDivider?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <section
      style={{
        minWidth: 0,
        width,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRight: showDivider ? "1px solid var(--border-base)" : "none",
        background: "var(--bg-base)",
      }}
    >
      <div style={{ ...tableHeaderCellStyle(), display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>{title}</span>
        {action}
      </div>
      <div className="scripture-scroll-pane" style={{ flex: 1, minHeight: 0 }}>
        {children}
      </div>
    </section>
  );
}

export function ScriptureCellButton({
  children,
  isActive,
  isPreview,
  isLive,
  isDisabled,
  onClick,
  onDoubleClick,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
  title,
  align = "left",
  hovered = false,
  trackHover = true,
  songId,
}: {
  children: React.ReactNode;
  isActive?: boolean;
  isPreview?: boolean;
  isLive?: boolean;
  isDisabled?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  title?: string;
  align?: "left" | "center";
  hovered?: boolean;
  trackHover?: boolean;
  songId?: string;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const activeColor = isLive ? "var(--color-success)" : isPreview ? "var(--color-primary)" : "var(--color-primary)";
  const isHighlighted = isActive || isPreview || isLive;
  const isRowHovered = hovered || (trackHover && isHovered);

  return (
    <button
      type="button"
      data-song-id={songId}
      disabled={isDisabled}
      title={title}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => {
        setIsHovered(true);
        onMouseEnter?.();
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        onMouseLeave?.();
      }}
      style={{
        display: "block",
        width: "100%",
        boxSizing: "border-box",
        minHeight: 30,
        padding: "6px 12px",
        background: isHighlighted || isRowHovered ? "var(--color-primary-muted)" : "transparent",
        border: "none",
        borderLeft: isActive || isPreview || isLive ? `2px solid ${activeColor}` : "2px solid transparent",
        color: isDisabled ? "var(--fg-subtle)" : isHighlighted ? activeColor : "var(--fg-base)",
        cursor: isDisabled ? "not-allowed" : "pointer",
        fontSize: "var(--text-xs)",
        fontWeight: isActive || isPreview || isLive ? 600 : 400,
        opacity: isDisabled ? 0.55 : 1,
        outline: "none",
        overflow: "hidden",
        textAlign: align,
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}
