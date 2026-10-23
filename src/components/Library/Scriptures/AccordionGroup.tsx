import type { LocalBibleEntry } from "../types";

export function AccordionGroup({
  label,
  isOpen,
  onToggle,
  children,
  showDivider = true,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  showDivider?: boolean;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          width: "100%",
          padding: "7px 10px",
          background: "transparent",
          border: "none",
          borderBottom: showDivider ? "1px solid var(--border-base)" : "none",
          cursor: "pointer",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-xs)",
          fontWeight: 600,
          letterSpacing: "0.06em",
          color: "var(--fg-muted)",
          textAlign: "left",
          transition: "color 120ms ease",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "var(--fg-base)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "var(--fg-muted)";
        }}
      >
        <span
          style={{
            display: "inline-block",
            transition: "transform 150ms ease",
            transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
            fontSize: "0.6rem",
            lineHeight: 1,
          }}
        >
          ▶
        </span>
        {label}
      </button>
      {isOpen && (
        <div
          className="scripture-scroll-pane"
          style={{
            borderBottom: showDivider ? "1px solid var(--border-base)" : "none",
            maxHeight: 200,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function BibleItem({
  bible,
  isSelected,
  onSelect,
}: {
  bible: LocalBibleEntry;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const isDisabled = !bible.available;

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button
        type="button"
        disabled={isDisabled}
        onClick={onSelect}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          width: "100%",
          padding: "5px 12px 5px 24px",
          background: isSelected ? "var(--color-primary-muted)" : "transparent",
          border: "none",
          borderLeft: isSelected ? "2px solid var(--color-primary)" : "2px solid transparent",
          cursor: isDisabled ? "not-allowed" : "pointer",
          fontSize: "var(--text-xs)",
          color: isDisabled ? "var(--fg-subtle)" : isSelected ? "var(--color-primary)" : "var(--fg-muted)",
          textAlign: "left",
          opacity: isDisabled ? 0.58 : 1,
          transition: "background 120ms ease, color 120ms ease",
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={bible.name || bible.abbreviation}
        >
          {bible.name || bible.abbreviation}
        </span>
        {!bible.available && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.62rem",
              color: "var(--fg-subtle)",
            }}
          >
            EMPTY
          </span>
        )}
      </button>
    </div>
  );
}
