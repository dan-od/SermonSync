import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { ProjectorSlide } from "../../types/state";
import { tagColor } from "./tagColor";

export interface CueProjectionSlide {
  label: string;
  text: string;
}

interface CueProjectionModalProps {
  title: string;
  slides: CueProjectionSlide[];
  onClose: () => void;
  onSendLive: (slide: ProjectorSlide) => void;
}

export function CueProjectionModal({ title, slides, onClose, onSendLive }: CueProjectionModalProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    sectionRef.current?.focus();
  }, []);

  const toProjectorSlide = (index: number): ProjectorSlide => ({
    reference: { book: title || "Untitled Song", chapter: 1, verse: index + 1 },
    text: slides[index].text,
    version: "SONG",
  });

  // every navigation change (pill click, prev/next, arrow keys) sends that slide live immediately
  useEffect(() => {
    if (slides[activeIndex]) onSendLive(toProjectorSlide(activeIndex));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, slides]);

  if (slides.length === 0) return null;

  const goTo = (index: number) => {
    if (index < 0 || index >= slides.length) return;
    setActiveIndex(index);
  };

  return createPortal(
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1350,
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: "var(--overlay-backdrop)",
      }}
    >
      <section
        ref={sectionRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cue-projection-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault();
            goTo(activeIndex + 1);
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            goTo(activeIndex - 1);
          } else if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        style={{
          position: "relative",
          width: "min(560px, 94vw)",
          maxHeight: "min(560px, 88vh)",
          overflow: "auto",
          padding: 20,
          borderRadius: "var(--radius-lg)",
          background: "var(--bg-surface)",
          boxShadow: "var(--shadow-lg)",
          outline: "none",
        }}
      >
        <button type="button" onClick={onClose} aria-label="Close" style={closeButtonStyle}>
          ×
        </button>
        <h2 id="cue-projection-title" style={{ margin: 0, color: "var(--fg-base)", fontSize: 17, paddingRight: 28 }}>
          {title || "Untitled Song"} cue
        </h2>
        <p style={{ margin: "8px 0 16px", color: "var(--fg-muted)", fontSize: 12 }}>
          Use Prev / Next or click a slide to send it live.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={() => goTo(activeIndex - 1)}
            disabled={activeIndex === 0}
            aria-label="Previous slide"
            style={navButtonStyle(activeIndex === 0)}
          >
            ‹ Prev
          </button>

          <div style={{ flex: 1, minWidth: 0, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {slides.map((slide, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  key={`${slide.label}-${index}`}
                  type="button"
                  onClick={() => goTo(index)}
                  style={{
                    padding: "5px 9px",
                    border: isActive ? "2px solid var(--fg-base)" : "2px solid transparent",
                    borderRadius: "var(--radius-sm)",
                    background: tagColor(slide.label),
                    color: "var(--fg-on-accent)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    opacity: isActive ? 1 : 0.55,
                    transition: "opacity 120ms ease",
                  }}
                >
                  {slide.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => goTo(activeIndex + 1)}
            disabled={activeIndex === slides.length - 1}
            aria-label="Next slide"
            style={navButtonStyle(activeIndex === slides.length - 1)}
          >
            Next ›
          </button>
        </div>

        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: "var(--radius-sm)",
            background: "var(--bg-elevated)",
            color: "var(--fg-base)",
            fontSize: 13,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            minHeight: 60,
          }}
        >
          {slides[activeIndex]?.text}
        </div>
      </section>
    </div>,
    document.body
  );
}

function navButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "6px 10px",
    border: "none",
    borderRadius: 6,
    background: "var(--bg-elevated)",
    color: disabled ? "var(--fg-subtle)" : "var(--fg-base)",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 12,
    fontWeight: 600,
    opacity: disabled ? 0.5 : 1,
    flexShrink: 0,
  };
}

const closeButtonStyle: React.CSSProperties = {
  position: "absolute",
  top: 12,
  right: 12,
  width: 26,
  height: 26,
  display: "grid",
  placeItems: "center",
  border: "none",
  borderRadius: 6,
  background: "var(--bg-elevated)",
  color: "var(--fg-base)",
  cursor: "pointer",
  fontSize: 16,
  lineHeight: 1,
};
