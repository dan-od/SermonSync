import { inputStyle } from "./inputStyle";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

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
  ariaLabel,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  triggerStyle?: CSSProperties;
  menuStyle?: CSSProperties;
  optionStyle?: CSSProperties;
  containerStyle?: CSSProperties;
  minMenuWidth?: number;
  ariaLabel?: string;
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
        className="ss-compact-trigger"
        aria-label={ariaLabel}
        onClick={() => setIsOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        style={{
          ...inputStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          textAlign: "left",
          ...triggerStyle,
          boxSizing: "border-box",
          height: "25px",
          minHeight: "25px",
          gap: "4px",
          padding: "0 8px",
          border: "none",
          outline: "none",
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
              className="ss-compact-menu"
              data-no-drag="true"
              style={{
                position: "fixed",
                top: `${rect.top}px`,
                left: `${rect.left}px`,
                width: `${rect.width}px`,
                zIndex: 2000,
                maxHeight: "240px",
                overflowY: "auto",
                background: "var(--bg-elevated)",
                boxShadow: "var(--shadow-md)",
                ...menuStyle,
                borderRadius: "5px",
                padding: "4px",
                border: "none",
              }}
            >
              {options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    className="ss-compact-menu-item"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                    }}
                    style={{
                      width: "100%",
                      border: "none",
                      outline: "none",
                      background: isSelected || highlightedOption === opt.value ? "var(--color-primary-muted)" : "transparent",
                      color: isSelected || highlightedOption === opt.value ? "var(--fg-base)" : "var(--fg-muted)",
                      fontFamily: "var(--font-sans)",
                      fontSize: "var(--text-xs)",
                      cursor: "pointer",
                      textAlign: "left",
                      ...optionStyle,
                      height: "25px",
                      minHeight: "25px",
                      boxSizing: "border-box",
                      padding: "0 8px",
                      borderRadius: "3px",
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
