import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { HeaderBar, type HeaderBarProps } from "./HeaderBar";
import { StatusBar, type StatusBarProps } from "./StatusBar";

interface AppLayoutProps {
  header: HeaderBarProps;
  status: StatusBarProps;
  leftPanel: ReactNode;
  centerPanel: ReactNode;
  rightPanel: ReactNode;
}

const MIN_LEFT_PANEL_WIDTH = 220;
const MIN_CENTER_PANEL_WIDTH = 140;
const MIN_RIGHT_PANEL_WIDTH = 720;
const MAX_LEFT_PANEL_RATIO = 0.33;
const MAX_CENTER_PANEL_RATIO = 0.42;
const DEFAULT_LEFT_WIDTH = 370;
const DEFAULT_CENTER_WIDTH = 340;
const DIVIDER_WIDTH = 6;
const PANEL_BOTTOM_INSET = 24;

function PanelFrame({
  children,
  contentStyle,
  style,
}: {
  children: ReactNode;
  contentStyle?: CSSProperties;
  style: CSSProperties;
}) {
  return (
    <section
      style={{
        boxSizing: "border-box",
        minWidth: 0,
        minHeight: 0,
        height: "100%",
        padding: "var(--space-2)",
        background: "var(--bg-base)",
        overflow: "hidden",
        ...style,
      }}
    >
      <div style={{ height: "100%", minHeight: 0, minWidth: 0, ...contentStyle }}>{children}</div>
    </section>
  );
}

function Divider({ onDrag, onReset }: { onDrag: (deltaX: number) => void; onReset: () => void }) {
  const lastXRef = useRef(0);
  const [isHovering, setIsHovering] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = (event: ReactMouseEvent) => {
    event.preventDefault();
    lastXRef.current = event.clientX;
    setIsDragging(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - lastXRef.current;
      lastXRef.current = moveEvent.clientX;
      onDrag(delta);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      onDoubleClick={onReset}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize panels. Double-click to reset."
      style={{
        width: `${DIVIDER_WIDTH}px`,
        flexShrink: 0,
        cursor: "col-resize",
        background: isHovering || isDragging ? "var(--border-base)" : "transparent",
        borderRadius: "999px",
        opacity: isDragging ? 1 : isHovering ? 0.75 : 0,
        transition: "opacity 120ms ease, background-color 120ms ease",
      }}
    />
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function maxLeftPanelWidth(containerWidth: number) {
  return Math.max(MIN_LEFT_PANEL_WIDTH, Math.floor(containerWidth * MAX_LEFT_PANEL_RATIO));
}

function maxCenterPanelWidth(containerWidth: number) {
  return Math.max(MIN_CENTER_PANEL_WIDTH, Math.floor(containerWidth * MAX_CENTER_PANEL_RATIO));
}

function clampWidths(containerWidth: number, left: number, center: number): [number, number] {
  const usableWidth = Math.max(0, containerWidth - DIVIDER_WIDTH * 2);
  const sidePanelBudget = Math.max(0, usableWidth - MIN_RIGHT_PANEL_WIDTH);
  const leftMaxByRatio = maxLeftPanelWidth(containerWidth);
  const centerMaxByRatio = maxCenterPanelWidth(containerWidth);

  if (sidePanelBudget <= MIN_LEFT_PANEL_WIDTH + MIN_CENTER_PANEL_WIDTH) {
    return [
      Math.min(MIN_LEFT_PANEL_WIDTH, Math.floor(sidePanelBudget / 2)),
      Math.min(MIN_CENTER_PANEL_WIDTH, Math.max(0, sidePanelBudget - Math.min(MIN_LEFT_PANEL_WIDTH, Math.floor(sidePanelBudget / 2)))),
    ];
  }

  const leftMax = Math.min(leftMaxByRatio, sidePanelBudget - MIN_CENTER_PANEL_WIDTH);
  let clampedLeft = clamp(left, MIN_LEFT_PANEL_WIDTH, leftMax);

  const centerMax = Math.min(centerMaxByRatio, sidePanelBudget - clampedLeft);
  let clampedCenter = clamp(center, MIN_CENTER_PANEL_WIDTH, centerMax);

  const overflow = clampedLeft + clampedCenter - sidePanelBudget;
  if (overflow > 0) {
    const reducibleCenter = Math.max(0, clampedCenter - MIN_CENTER_PANEL_WIDTH);
    const reduceCenterBy = Math.min(overflow, reducibleCenter);
    clampedCenter -= reduceCenterBy;

    const remainingOverflow = overflow - reduceCenterBy;
    if (remainingOverflow > 0) {
      clampedLeft = Math.max(MIN_LEFT_PANEL_WIDTH, clampedLeft - remainingOverflow);
    }
  }

  return [clampedLeft, clampedCenter];
}

export function AppLayout({ header, status, leftPanel, centerPanel, rightPanel }: AppLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [widths, setWidths] = useState({ left: DEFAULT_LEFT_WIDTH, center: DEFAULT_CENTER_WIDTH });

  const getContainerContentWidth = () => {
    const container = containerRef.current;
    if (!container) {
      return Infinity;
    }

    const styles = window.getComputedStyle(container);
    const leftPadding = Number.parseFloat(styles.paddingLeft) || 0;
    const rightPadding = Number.parseFloat(styles.paddingRight) || 0;
    return Math.max(0, container.clientWidth - leftPadding - rightPadding);
  };

  // Re-clamp whenever the window/container is resized so the right panel can
  // never get squeezed past its minimum and overflow (clip) past the edge.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const observer = new ResizeObserver(() => {
      const contentWidth = getContainerContentWidth();
      setWidths((current) => {
        const [left, center] = clampWidths(contentWidth, current.left, current.center);
        return left === current.left && center === current.center ? current : { left, center };
      });
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handleLeftDrag = useCallback((deltaX: number) => {
    setWidths((current) => {
      const containerWidth = getContainerContentWidth();
      const [left, center] = clampWidths(containerWidth, current.left + deltaX, current.center);
      return { left, center };
    });
  }, []);

  const handleCenterDrag = useCallback((deltaX: number) => {
    setWidths((current) => {
      const containerWidth = getContainerContentWidth();
      const [left, center] = clampWidths(containerWidth, current.left, current.center + deltaX);
      return { left, center };
    });
  }, []);

  const resetLeft = useCallback(() => {
    setWidths((current) => {
      const containerWidth = getContainerContentWidth();
      const [left, center] = clampWidths(containerWidth, DEFAULT_LEFT_WIDTH, current.center);
      return { left, center };
    });
  }, []);

  const resetCenter = useCallback(() => {
    setWidths((current) => {
      const containerWidth = getContainerContentWidth();
      const [left, center] = clampWidths(containerWidth, current.left, DEFAULT_CENTER_WIDTH);
      return { left, center };
    });
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh" }}>
      <HeaderBar {...header} />
      <div
        ref={containerRef}
        style={{ flex: "1.35 1 0", minHeight: 0, padding: "var(--space-2)", boxSizing: "border-box", overflow: "hidden" }}
      >
        <div style={{ display: "flex", height: "100%" }}>
          <PanelFrame
            contentStyle={{ height: `calc(100% - ${PANEL_BOTTOM_INSET}px)` }}
            style={{ width: `${widths.left}px`, flexShrink: 0 }}
          >
            {leftPanel}
          </PanelFrame>
          <Divider onDrag={handleLeftDrag} onReset={resetLeft} />
          <PanelFrame
            contentStyle={{ height: `calc(100% - ${PANEL_BOTTOM_INSET}px)` }}
            style={{ width: `${widths.center}px`, flexShrink: 0 }}
          >
            {centerPanel}
          </PanelFrame>
          <Divider onDrag={handleCenterDrag} onReset={resetCenter} />
          <PanelFrame style={{ flex: 1, minWidth: 0 }}>{rightPanel}</PanelFrame>
        </div>
      </div>
      <div style={{ flex: "1 1 0", minHeight: 0 }} />
      <StatusBar {...status} />
    </div>
  );
}
