/** Settings primitives: portaled custom dropdown. */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import { inputStyle } from "./primitiveStyles";

/**
 * Custom trigger + listbox dropdown, matching the pattern already used in
 * StatusBar.tsx's input-device picker (button toggles an option list that
 * closes on outside click). The listbox is portaled to document.body and
 * positioned with fixed coordinates so it's never clipped by a scrollable
 * or overflow:hidden ancestor (e.g. the Settings modal's scroll area).
 */
export function Dropdown({
  value,
  options,
  onChange,
  triggerStyle,
  menuStyle,
  optionStyle,
  containerStyle,
  minMenuWidth,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  triggerStyle?: CSSProperties;
  menuStyle?: CSSProperties;
  optionStyle?: CSSProperties;
  containerStyle?: CSSProperties;
  minMenuWidth?: number;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedOption, setHighlightedOption] = useState<string | null>(null);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const selected = options.find((opt) => opt.value === value);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const trigger = triggerRef.current;
    if (!trigger) return;
    const bounds = trigger.getBoundingClientRect();
    const width = minMenuWidth ? Math.max(bounds.width, minMenuWidth) : bounds.width;
    setRect({ top: bounds.bottom + 4, left: bounds.left, width });
  }, [isOpen, minMenuWidth]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !listRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    const handleReposition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const bounds = trigger.getBoundingClientRect();
      const width = minMenuWidth ? Math.max(bounds.width, minMenuWidth) : bounds.width;
      setRect({ top: bounds.bottom + 4, left: bounds.left, width });
    };

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [isOpen, minMenuWidth]);

  return (
    <div style={{ position: "relative", width: "100%", ...containerStyle }}>
      <button
        ref={triggerRef}
        type="button"
        data-no-drag="true"
        onClick={() => setIsOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        style={{
          ...inputStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          cursor: "pointer",
          textAlign: "left",
          ...triggerStyle,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected?.label ?? value}</span>
        <span style={{ color: "var(--fg-subtle)", flexShrink: 0 }}>⌄</span>
      </button>
      {isOpen && rect
        ? createPortal(
            <div
              ref={listRef}
              role="listbox"
              data-no-drag="true"
              style={{
                position: "fixed",
                top: `${rect.top}px`,
                left: `${rect.left}px`,
                width: `${rect.width}px`,
                zIndex: 2000,
                maxHeight: "240px",
                overflowY: "auto",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-elevated)",
                boxShadow: "var(--shadow-md)",
                padding: "4px",
                border: "1px solid var(--border-base)",
                ...menuStyle,
              }}
            >
              {options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                    }}
                    style={{
                      width: "100%",
                      border: "none",
                      outline: "none",
                      borderRadius: "6px",
                    background: isSelected || highlightedOption === opt.value ? "var(--color-primary-muted)" : "transparent",
                    color: isSelected || highlightedOption === opt.value ? "var(--fg-base)" : "var(--fg-muted)",
                      fontFamily: "var(--font-sans)",
                      fontSize: "var(--text-xs)",
                      padding: "8px 9px",
                     cursor: "pointer",
                     textAlign: "left",
                     ...optionStyle,
                    }}
                    onMouseEnter={() => setHighlightedOption(opt.value)}
                    onMouseLeave={() => setHighlightedOption(null)}
                    onFocus={() => setHighlightedOption(opt.value)}
                    onBlur={() => setHighlightedOption(null)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
