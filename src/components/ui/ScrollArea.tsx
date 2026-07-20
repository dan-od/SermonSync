import { type CSSProperties, type ReactNode, useCallback, useEffect, useRef, useState } from "react";

interface ScrollAreaProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  contentStyle?: CSSProperties;
  orientation?: "vertical" | "both";
}

const MIN_THUMB_SIZE = 36;

export function ScrollArea({
  children,
  className,
  style,
  contentStyle,
  orientation = "vertical",
}: ScrollAreaProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ height: 0, top: 0, visible: false });

  const updateThumb = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const { clientHeight, scrollHeight, scrollTop } = viewport;
    const visible = scrollHeight > clientHeight + 1;

    if (!visible) {
      setThumb({ height: 0, top: 0, visible: false });
      return;
    }

    const height = Math.max(MIN_THUMB_SIZE, (clientHeight / scrollHeight) * clientHeight);
    const maxTop = clientHeight - height;
    const top = maxTop <= 0 ? 0 : (scrollTop / (scrollHeight - clientHeight)) * maxTop;
    setThumb({ height, top, visible: true });
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    updateThumb();
    const observer = new ResizeObserver(updateThumb);
    observer.observe(viewport);

    const content = viewport.firstElementChild;
    if (content) {
      observer.observe(content);
    }

    return () => observer.disconnect();
  }, [updateThumb, children]);

  const handleThumbPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport || !thumb.visible) {
      return;
    }

    event.preventDefault();
    const startY = event.clientY;
    const startScrollTop = viewport.scrollTop;
    const maxScrollTop = viewport.scrollHeight - viewport.clientHeight;
    const maxThumbTop = viewport.clientHeight - thumb.height;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const scrollDelta = maxThumbTop <= 0 ? 0 : (deltaY / maxThumbTop) * maxScrollTop;
      viewport.scrollTop = startScrollTop + scrollDelta;
    };

    const handlePointerUp = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  };

  return (
    <div className={className} style={{ minHeight: 0, minWidth: 0, display: "flex", ...style }}>
      <div
        ref={viewportRef}
        className="ss-scroll-viewport"
        onScroll={updateThumb}
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflowY: "auto",
          overflowX: orientation === "both" ? "auto" : "hidden",
        }}
      >
        <div style={{ minWidth: 0, ...contentStyle }}>{children}</div>
      </div>
      <div className="ss-scroll-rail" aria-hidden="true">
        {thumb.visible ? (
          <div
            className="ss-scroll-thumb"
            onPointerDown={handleThumbPointerDown}
            style={{
              height: `${thumb.height}px`,
              transform: `translateY(${thumb.top}px)`,
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
