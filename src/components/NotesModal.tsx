import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { TranscriptItem } from "./desktop/uiTypes";

const AiPanel = lazy(() => import("./AiPanel").then((module) => ({ default: module.AiPanel })));

interface NotesModalProps {
  open: boolean;
  items: TranscriptItem[];
  pendingCount: number;
  onClose: () => void;
}

export function NotesModal({ open, items, pendingCount, onClose }: NotesModalProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const [isCloseHovered, setIsCloseHovered] = useState(false);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  return createPortal(
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{ position: "fixed", inset: 0, zIndex: 1450, display: open ? "block" : "none", padding: "48px 6vw 6vh", background: "color-mix(in srgb, var(--bg-base) 72%, transparent)", backdropFilter: "blur(8px)" }}
    >
      <div style={{ height: "100%", overflow: "hidden", background: "var(--bg-base)", boxShadow: "var(--shadow-lg)" }}>
        <section
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Notes and summary"
          tabIndex={-1}
          style={{ height: "100%", position: "relative", outline: "none" }}
        >
          <button
            type="button"
            onClick={onClose}
            onMouseEnter={() => setIsCloseHovered(true)}
            onMouseLeave={() => setIsCloseHovered(false)}
            aria-label="Close notes"
            title="Close notes"
            style={{ position: "absolute", top: 14, right: 16, zIndex: 2, border: "none", background: isCloseHovered ? "var(--color-primary)" : "var(--bg-elevated)", color: isCloseHovered ? "var(--fg-on-accent)" : "var(--fg-muted)", width: 28, height: 28, cursor: "pointer", fontSize: 18, lineHeight: 1, transition: "background-color 120ms ease, color 120ms ease" }}
          >
            ×
          </button>
          <div style={{ height: "100%", minHeight: 0, padding: 12 }}>
            <Suspense fallback={<div style={{ color: "var(--fg-muted)", fontSize: 12 }}>Loading notes...</div>}>
              <AiPanel items={items} pendingCount={pendingCount} />
            </Suspense>
          </div>
        </section>
      </div>
    </div>,
    document.body,
  );
}