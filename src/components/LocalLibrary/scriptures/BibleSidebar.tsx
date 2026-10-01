import type { LocalBibleEntry } from "../types";

export function BibleSidebar({
  localOpen,
  setLocalOpen,
  apiOpen,
  setApiOpen,
  localBibles,
  selectedBibleId,
  selectBible,
  setAddModalOpen,
}: {
  localOpen: boolean;
  setLocalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  apiOpen: boolean;
  setApiOpen: React.Dispatch<React.SetStateAction<boolean>>;
  localBibles: LocalBibleEntry[];
  selectedBibleId: string | null;
  selectBible: (bible: LocalBibleEntry) => void;
  setAddModalOpen: (open: boolean) => void;
}) {
  return (
    <div
      style={{
        width: 188,
        flexShrink: 0,
        borderRight: "1px solid var(--border-base)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div className="scripture-scroll-pane" style={{ flex: 1, minHeight: 0 }}>
        {/* Local Bibles accordion */}
        <AccordionGroup
          label="+ Local Bibles"
          isOpen={localOpen}
          onToggle={() => setLocalOpen((v) => !v)}
        >
          {localBibles.map((bible) => (
            <BibleItem
              key={bible.id}
              bible={bible}
              isSelected={selectedBibleId === bible.id}
              onSelect={() => selectBible(bible)}
            />
          ))}
          {localBibles.length === 0 && (
            <div
              style={{
                padding: "6px 12px 6px 24px",
                fontSize: "var(--text-xs)",
                color: "var(--fg-subtle)",
                fontStyle: "italic",
              }}
            >
              Import a Bible file to populate this library
            </div>
          )}
        </AccordionGroup>

        {/* API Bibles accordion */}
        <AccordionGroup
          label="+ API Bibles"
          isOpen={apiOpen}
          onToggle={() => setApiOpen((v) => !v)}
        >
          <div
            style={{
              padding: "6px 12px 6px 24px",
              fontSize: "var(--text-xs)",
              color: "var(--fg-subtle)",
              fontStyle: "italic",
            }}
          >
            No API bibles connected
          </div>
        </AccordionGroup>
      </div>

      {/* Add button pinned to bottom */}
      <div
        style={{
          padding: "var(--space-2)",
          borderTop: "1px solid var(--border-base)",
        }}
      >
        <button
          type="button"
          onClick={() => setAddModalOpen(true)}
          title="Add scripture"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: "var(--radius-sm)",
            background: "var(--color-primary-muted)",
            border: "1px solid var(--color-primary)",
            color: "var(--color-primary)",
            fontSize: "var(--text-base)",
            lineHeight: 1,
            cursor: "pointer",
            transition: "background 120ms ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--color-primary)";
            (e.currentTarget as HTMLButtonElement).style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--color-primary-muted)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--color-primary)";
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function AccordionGroup({
  label,
  isOpen,
  onToggle,
  children,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
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
          borderBottom: "1px solid var(--border-base)",
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
            borderBottom: "1px solid var(--border-base)",
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
