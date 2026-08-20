import { useRef, type ClipboardEvent as ReactClipboardEvent, type KeyboardEvent } from "react";

import { CHURCH_ID_PREFIX, CHURCH_ID_SUFFIX_LENGTH } from "./types";

interface ChurchIdInputProps {
  value: string;
  onChange: (value: string) => void;
}

const ALLOWED_CHARS = /^[A-Z0-9]$/;

/**
 * Segmented "password box" entry for the Church ID suffix. The "FSQ-"
 * prefix is fixed and shown as static text; the operator only ever types
 * the 6-character suffix, one box at a time (auto-advances forward on
 * entry, back on backspace) — matching the requested FSQ-3A5HE6 format.
 */
export function ChurchIdInput({ value, onChange }: ChurchIdInputProps) {
  const boxRefs = useRef<(HTMLInputElement | null)[]>([]);
  const chars = Array.from({ length: CHURCH_ID_SUFFIX_LENGTH }, (_, i) => value[i] ?? "");

  const setCharAt = (index: number, char: string) => {
    const next = [...chars];
    next[index] = char;
    onChange(next.join("").replace(/\s+$/, ""));
  };

  const handleChange = (index: number, raw: string) => {
    const upper = raw.toUpperCase();
    const lastChar = upper.slice(-1);

    if (lastChar && !ALLOWED_CHARS.test(lastChar)) {
      return;
    }

    setCharAt(index, lastChar);

    if (lastChar && index < CHURCH_ID_SUFFIX_LENGTH - 1) {
      boxRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !chars[index] && index > 0) {
      event.preventDefault();
      boxRefs.current[index - 1]?.focus();
      setCharAt(index - 1, "");
      return;
    }
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      boxRefs.current[index - 1]?.focus();
    }
    if (event.key === "ArrowRight" && index < CHURCH_ID_SUFFIX_LENGTH - 1) {
      event.preventDefault();
      boxRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (index: number, event: ReactClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData
      .getData("text")
      .toUpperCase()
      .replace(new RegExp(`^${CHURCH_ID_PREFIX}-?`), "")
      .replace(/[^A-Z0-9]/g, "");

    if (!pasted) return;
    event.preventDefault();

    const next = [...chars];
    for (let offset = 0; offset < pasted.length && index + offset < CHURCH_ID_SUFFIX_LENGTH; offset++) {
      next[index + offset] = pasted[offset];
    }
    onChange(next.join("").replace(/\s+$/, ""));

    const lastFilledIndex = Math.min(index + pasted.length, CHURCH_ID_SUFFIX_LENGTH - 1);
    boxRefs.current[lastFilledIndex]?.focus();
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <style>{`
        .ss-church-id-box:focus {
          box-shadow: 0 0 0 2px var(--color-primary-muted);
        }
      `}</style>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-lg)",
          fontWeight: 700,
          color: "var(--fg-subtle)",
          letterSpacing: "0.04em",
        }}
      >
        {CHURCH_ID_PREFIX} -
      </span>
      <div style={{ display: "flex", gap: "6px" }}>
        {chars.map((char, index) => (
          <input
            key={index}
            ref={(el) => {
              boxRefs.current[index] = el;
            }}
            value={char}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={(e) => handlePaste(index, e)}
            onFocus={(e) => e.currentTarget.select()}
            maxLength={1}
            inputMode="text"
            aria-label={`Church ID character ${index + 1}`}
            style={{
              width: "38px",
              height: "44px",
              boxSizing: "border-box",
              textAlign: "center",
              background: "var(--bg-elevated)",
              border: "none",
              outline: "none",
              borderRadius: "var(--radius-md)",
              color: "var(--fg-base)",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-lg)",
              fontWeight: 700,
              caretColor: "var(--color-primary)",
              transition: "box-shadow 150ms ease",
            }}
            onMouseDown={(e) => e.currentTarget.focus()}
            className="ss-church-id-box"
          />
        ))}
      </div>
    </div>
  );
}
