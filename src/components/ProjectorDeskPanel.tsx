import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type SVGProps } from "react";

import type { OverlayMode, ProjectorMedia, ProjectorSlide, VerseTheme } from "../types/state";

import { closeProjectorOutput, openProjectorOutput, selectedDisplay } from "../lib/projectorOutput";
import { useProjectorStore } from "../stores/projectorStore";
import { ProjectorView } from "./ProjectorView";

const SPLIT_DIVIDER_WIDTH = 6;
const MIN_SCREEN_WIDTH = 260;
const DEFAULT_SPLIT_RATIO = 0.5;
const PROJECTION_FONT_SIZE_PX = 48;

/** "Cast" glyph: device outline broadcasting to a screen, used for the output toggle. */
function IconCast(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width="13" height="13" aria-hidden="true" {...props}>
      <path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7" />
      <path d="M2 12a6 6 0 0 1 6 6" />
      <path d="M2 16a2 2 0 0 1 2 2" />
      <circle cx="3" cy="20" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Same glyph with a filled screen indicator, used once the output is live. */
function IconCastConnected(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width="13" height="13" aria-hidden="true" {...props}>
      <path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7" />
      <path d="M2 12a6 6 0 0 1 6 6" />
      <rect x="1" y="16.5" width="5" height="5" rx="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

interface ProjectorDeskPanelProps {
  previewSlide: ProjectorSlide | null;
  liveSlide: ProjectorSlide | null;
  previewMedia?: ProjectorMedia | null;
  liveMedia?: ProjectorMedia | null;
  feedOverride: "live" | "logo" | "black" | "clear";
  onOverlayModeChange?: (mode: OverlayMode) => void;
  theme: VerseTheme;
  onPrevious: () => void;
  onNext: () => void;
}

export function ProjectorDeskPanel({
  previewSlide,
  liveSlide,
  previewMedia = null,
  liveMedia = null,
  feedOverride,
  theme,
  onPrevious,
  onNext,
}: ProjectorDeskPanelProps) {
  const overlayMode = useProjectorStore((s) => s.overlayMode);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ clientX: 0, previewWidth: 0 });
  const [autoSendEnabled, setAutoSendEnabled] = useState(true);
  const [splitWidth, setSplitWidth] = useState(0);
  const [previewWidth, setPreviewWidth] = useState(0);
  const [isDividerHovering, setIsDividerHovering] = useState(false);
  const [isDividerDragging, setIsDividerDragging] = useState(false);
  const outputStatus = useProjectorStore((s) => s.outputStatus);
  const livePlayback = useProjectorStore((s) => s.livePlayback);
  const activeOverlays = useProjectorStore((s) => s.activeOverlays);
  const setLivePlayback = useProjectorStore((s) => s.setLivePlayback);
  const seekLivePlayback = useProjectorStore((s) => s.seekLivePlayback);
  const hasSelectedDisplay = useProjectorStore((s) => s.selectedDisplayId !== null);
  const isOutputLive = outputStatus === "connected" || outputStatus === "ready";
  const [isTogglingOutput, setIsTogglingOutput] = useState(false);

  const handleToggleOutput = useCallback(async () => {
    setIsTogglingOutput(true);
    try {
      if (isOutputLive) {
        await closeProjectorOutput();
      } else {
        const display = selectedDisplay();
        if (display) await openProjectorOutput(display);
      }
    } catch {
      // openProjectorOutput/closeProjectorOutput already record the failure on the store.
    } finally {
      setIsTogglingOutput(false);
    }
  }, [isOutputLive]);

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
    <div
      style={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        background: "var(--bg-surface)",
        border: "none",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-3)",
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
      }}
    >
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
                background: "var(--fg-on-accent)",
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
          <span style={{ color: "var(--fg-subtle)" }}>|</span>
          <button
            type="button"
            onClick={() => void handleToggleOutput()}
            disabled={isTogglingOutput || (!isOutputLive && !hasSelectedDisplay)}
            title={isOutputLive ? "Close the projector output window" : "Open the projector output window"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              border: "none",
              background: isOutputLive ? "var(--color-primary-muted)" : "var(--bg-elevated)",
              color: isOutputLive ? "var(--color-primary)" : "var(--fg-base)",
              borderRadius: "var(--radius-md)",
              padding: "4px 8px",
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              lineHeight: 1,
              cursor: isTogglingOutput || (!isOutputLive && !hasSelectedDisplay) ? "not-allowed" : "pointer",
              opacity: isTogglingOutput || (!isOutputLive && !hasSelectedDisplay) ? 0.55 : 1,
            }}
          >
            {isOutputLive ? <IconCastConnected /> : <IconCast />}
            {isOutputLive ? "CLOSE OUTPUT" : "OPEN OUTPUT"}
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
          gridTemplateRows: "1fr",
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
          <ProjectorView title="PREVIEW" slide={previewSlide} media={previewMedia} feedOverride="live" overlayMode={overlayMode} theme={theme} isLive={false} fontSizePx={PROJECTION_FONT_SIZE_PX} />
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
            gridRow: "1",
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
          <ProjectorView title="LIVE" slide={liveSlide} media={liveMedia} overlays={activeOverlays} feedOverride={feedOverride} overlayMode={overlayMode} theme={theme} isLive={liveSlide !== null || liveMedia !== null || activeOverlays.length > 0} fontSizePx={PROJECTION_FONT_SIZE_PX} playback={livePlayback} onPlaybackChange={setLivePlayback} onSeek={seekLivePlayback} />
        </div>
      </div>
    </div>
  );
}
