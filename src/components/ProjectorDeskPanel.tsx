import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

import type { OverlayMode, ProjectorSlide, VerseTheme } from "../types/state";

import { ProjectorView } from "./ProjectorView";

const SPLIT_DIVIDER_WIDTH = 6;
const MIN_SCREEN_WIDTH = 260;
const DEFAULT_SPLIT_RATIO = 0.5;

interface ProjectorDeskPanelProps {
  previewSlide: ProjectorSlide | null;
  liveSlide: ProjectorSlide | null;
  feedOverride: "live" | "logo" | "black" | "clear";
  overlayMode: OverlayMode;
  onOverlayModeChange: (mode: OverlayMode) => void;
  theme: VerseTheme;
  onSendLive: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

export function ProjectorDeskPanel({
  previewSlide,
  liveSlide,
  feedOverride,
  overlayMode,
  onOverlayModeChange,
  theme,
  onSendLive,
  onPrevious,
  onNext,
}: ProjectorDeskPanelProps) {
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ clientX: 0, previewWidth: 0 });
  const [fontSizePx, setFontSizePx] = useState(48);
  const [autoSendEnabled, setAutoSendEnabled] = useState(true);
  const [splitWidth, setSplitWidth] = useState(0);
  const [previewWidth, setPreviewWidth] = useState(0);
  const [isDividerHovering, setIsDividerHovering] = useState(false);
  const [isDividerDragging, setIsDividerDragging] = useState(false);

  const clampPreviewWidth = useCallback((containerWidth: number, nextPreviewWidth: number) => {
    const availableWidth = Math.max(0, containerWidth - SPLIT_DIVIDER_WIDTH);
    const minimumWidth = Math.min(MIN_SCREEN_WIDTH, Math.floor(availableWidth / 2));
    const maximumWidth = Math.max(minimumWidth, availableWidth - minimumWidth);

    return Math.min(Math.max(nextPreviewWidth, minimumWidth), maximumWidth);
  }, []);

  const resetSplit = useCallback(() => {
    const containerWidth = splitContainerRef.current?.clientWidth ?? splitWidth;
    setPreviewWidth(clampPreviewWidth(containerWidth, (containerWidth - SPLIT_DIVIDER_WIDTH) * DEFAULT_SPLIT_RATIO));
  }, [clampPreviewWidth, splitWidth]);

  useEffect(() => {
    const container = splitContainerRef.current;
    if (!container) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = entry.contentRect.width;
      setSplitWidth(nextWidth);
      setPreviewWidth((current) => {
        const fallbackWidth = (nextWidth - SPLIT_DIVIDER_WIDTH) * DEFAULT_SPLIT_RATIO;
        return clampPreviewWidth(nextWidth, current > 0 ? current : fallbackWidth);
      });
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [clampPreviewWidth]);

  const handleDividerMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      const containerWidth = splitContainerRef.current?.clientWidth ?? splitWidth;
      const initialPreviewWidth =
        previewWidth > 0 ? previewWidth : (containerWidth - SPLIT_DIVIDER_WIDTH) * DEFAULT_SPLIT_RATIO;

      dragStartRef.current = {
        clientX: event.clientX,
        previewWidth: initialPreviewWidth,
      };
      setIsDividerDragging(true);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const nextContainerWidth = splitContainerRef.current?.clientWidth ?? containerWidth;
        const deltaX = moveEvent.clientX - dragStartRef.current.clientX;
        setPreviewWidth(clampPreviewWidth(nextContainerWidth, dragStartRef.current.previewWidth + deltaX));
      };

      const handleMouseUp = () => {
        setIsDividerDragging(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [clampPreviewWidth, previewWidth, splitWidth],
  );

  const availableSplitWidth = Math.max(0, splitWidth - SPLIT_DIVIDER_WIDTH);
  const effectivePreviewWidth =
    splitWidth > 0
      ? clampPreviewWidth(splitWidth, previewWidth > 0 ? previewWidth : availableSplitWidth * DEFAULT_SPLIT_RATIO)
      : 0;
  const liveWidth = Math.max(0, availableSplitWidth - effectivePreviewWidth);
  const previewColumnWidth = splitWidth > 0 ? `${effectivePreviewWidth}px` : "calc((100% - 12px) / 2)";
  const liveColumnWidth = splitWidth > 0 ? `${liveWidth}px` : "calc((100% - 12px) / 2)";

  return (
    <div style={{ height: "100%", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", gap: "6px" }}>
      <div
        style={{
          padding: "2px 10px 6px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-2)",
          minWidth: 0,
          color: "var(--fg-muted)",
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
        }}
      >
        <span style={{ color: "var(--fg-base)", letterSpacing: "0.1em", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>PROJECTION SIMULATION</span>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flexShrink: 0 }}>
          <span style={{ color: "var(--fg-muted)" }}>FONT SIZE :</span>
          <input
            type="range"
            min={28}
            max={72}
            value={fontSizePx}
            onChange={(event) => setFontSizePx(Number(event.target.value))}
            style={{ width: "70px", accentColor: "var(--color-primary)" }}
          />
          <span style={{ color: "var(--fg-base)", minWidth: "32px" }}>{fontSizePx}px</span>
          <span style={{ color: "var(--fg-subtle)" }}>|</span>
          <span style={{ color: "var(--fg-muted)" }}>AUTO SEND :</span>
          <button
            type="button"
            onClick={() => setAutoSendEnabled((current) => !current)}
            style={{
              width: "36px",
              height: "20px",
              border: "none",
              borderRadius: "999px",
              background: autoSendEnabled ? "var(--color-primary)" : "var(--border-base)",
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
              cursor: "pointer",
            }}
            title={autoSendEnabled ? "Auto send on" : "Auto send off"}
          >
            <span
              style={{
                width: "16px",
                height: "16px",
                borderRadius: "50%",
                background: "#fff",
                position: "absolute",
                left: "2px",
                transform: autoSendEnabled ? "translateX(16px)" : "translateX(0)",
                transition: "transform 0.18s ease",
              }}
            />
          </button>
          <span style={{ color: "var(--fg-subtle)" }}>|</span>
          <button
            type="button"
            onClick={onPrevious}
            style={{
              border: "none",
              background: "var(--bg-elevated)",
              color: "var(--fg-base)",
              borderRadius: "var(--radius-md)",
              padding: "4px 8px",
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            ‹ PREV
          </button>
          <button
            type="button"
            onClick={onNext}
            style={{
              border: "none",
              background: "var(--bg-elevated)",
              color: "var(--fg-base)",
              borderRadius: "var(--radius-md)",
              padding: "4px 8px",
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            NEXT ›
          </button>
        </div>
      </div>

      <div
        ref={splitContainerRef}
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: `${previewColumnWidth} ${SPLIT_DIVIDER_WIDTH}px ${liveColumnWidth}`,
          gridTemplateRows: "minmax(0, 1fr) auto",
          gap: "6px 0",
        }}
      >
        <div
          style={{
            gridColumn: "1",
            gridRow: "1",
            minWidth: 0,
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            padding: "8px",
          }}
        >
          <ProjectorView title="PREVIEW" slide={previewSlide} feedOverride="live" overlayMode={overlayMode} theme={theme} isLive={false} fontSizePx={fontSizePx} />
        </div>

        <div
          onMouseDown={handleDividerMouseDown}
          onDoubleClick={resetSplit}
          onMouseEnter={() => setIsDividerHovering(true)}
          onMouseLeave={() => setIsDividerHovering(false)}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize preview and live screens"
          title="Drag to resize preview/live screens. Double-click to reset."
          style={{
            gridColumn: "2",
            gridRow: "1 / span 2",
            width: `${SPLIT_DIVIDER_WIDTH}px`,
            minHeight: 0,
            cursor: "col-resize",
            touchAction: "none",
            background: isDividerHovering || isDividerDragging ? "var(--border-base)" : "transparent",
            borderRadius: "999px",
            opacity: isDividerDragging ? 1 : isDividerHovering ? 0.75 : 0,
            transition: "opacity 120ms ease, background-color 120ms ease",
          }}
        />

        <div
          style={{
            gridColumn: "3",
            gridRow: "1",
            minWidth: 0,
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            padding: "8px",
          }}
        >
          <ProjectorView title="LIVE" slide={liveSlide} feedOverride={feedOverride} overlayMode={overlayMode} theme={theme} isLive={liveSlide !== null} fontSizePx={fontSizePx} />
        </div>

        <div style={{ gridColumn: "1", gridRow: "2", display: "grid", gridTemplateColumns: "1fr", gap: "6px", minWidth: 0, overflow: "hidden" }}>
          <button
            type="button"
            onClick={onSendLive}
            style={{
              width: "50%",
              maxWidth: "260px",
              justifySelf: "center",
              border: "none",
              borderRadius: "var(--radius-lg)",
              padding: "2px 10px",
              background: "linear-gradient(90deg, #8f1df0, #b822ff)",
              color: "white",
              fontFamily: "var(--font-sans)",
              fontWeight: 800,
              fontSize: "12px",
              lineHeight: 1.1,
              letterSpacing: "0.02em",
              cursor: "pointer",
              opacity: autoSendEnabled ? 1 : 0.94,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            ▷ ▶ DISPLAY LIVE
          </button>
        </div>

        <div style={{ gridColumn: "3", gridRow: "2", display: "grid", gridTemplateColumns: "1fr", gap: "6px", minWidth: 0, overflow: "hidden" }}>
            <div
              style={{
                border: "none",
                borderRadius: "4px",
                background: "var(--bg-surface)",
                padding: "6px",
                display: "grid",
                gap: "6px",
                minWidth: 0,
                width: "70%",
                maxWidth: "300px",
                justifySelf: "center",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "8px",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--fg-muted)",
                }}
              >
                Screen Layout Mode
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: "6px",
                  background: "var(--bg-elevated)",
                  border: "none",
                  borderRadius: "4px",
                  padding: "3px",
                  minWidth: 0,
                }}
              >
                <button
                  type="button"
                  onClick={() => onOverlayModeChange("widescreen")}
                  aria-pressed={overlayMode === "widescreen"}
                  style={{
                    border: "none",
                    borderRadius: "3px",
                    padding: "5px 8px",
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    lineHeight: 1.1,
                    whiteSpace: "nowrap",
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    cursor: "pointer",
                    background: overlayMode === "widescreen" ? "var(--color-primary-muted)" : "transparent",
                    color: overlayMode === "widescreen" ? "var(--fg-base)" : "var(--fg-muted)",
                    fontWeight: overlayMode === "widescreen" ? 700 : 500,
                    boxShadow: "none",
                    outline: "none",
                    transform: overlayMode === "widescreen" ? "scale(1.015)" : "scale(1)",
                    transition: "background-color 160ms ease, color 160ms ease, box-shadow 160ms ease, transform 160ms ease",
                  }}
                >
                  Widescreen Slide
                </button>
                <button
                  type="button"
                  onClick={() => onOverlayModeChange("lower-third")}
                  aria-pressed={overlayMode === "lower-third"}
                  style={{
                    border: "none",
                    borderRadius: "3px",
                    padding: "5px 8px",
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    lineHeight: 1.1,
                    whiteSpace: "nowrap",
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    cursor: "pointer",
                    background: overlayMode === "lower-third" ? "var(--color-primary-muted)" : "transparent",
                    color: overlayMode === "lower-third" ? "var(--fg-base)" : "var(--fg-muted)",
                    fontWeight: overlayMode === "lower-third" ? 700 : 500,
                    boxShadow: "none",
                    outline: "none",
                    transform: overlayMode === "lower-third" ? "scale(1.015)" : "scale(1)",
                    transition: "background-color 160ms ease, color 160ms ease, box-shadow 160ms ease, transform 160ms ease",
                  }}
                >
                  Lower Third
                </button>
              </div>
            </div>
          </div>
      </div>
    </div>
  );
}
