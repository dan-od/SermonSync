import { useState } from "react";
import { createPortal } from "react-dom";
import { useSongStore, type Song } from "../../stores/songStore";

interface NewSongModalProps {
  open: boolean;
  onClose: () => void;
  onSongCreated: (song: Song, mode: "quick" | "search") => void;
}

export function NewSongModal({ open, onClose, onSongCreated }: NewSongModalProps) {
  const [songName, setSongName] = useState("");
  const [hasTitleError, setHasTitleError] = useState(false);
  const createSong = useSongStore((s) => s.createSong);

  if (!open) return null;

  const handleSelectOption = (mode: "quick" | "search") => {
    const title = songName.trim();
    if (!title) {
      setHasTitleError(true);
      return;
    }
    let initialSlides = [
      { label: "Verse 1", text: "Enter verse 1 lyrics here..." },
      { label: "Chorus", text: "Enter chorus lyrics here..." },
    ];
    if (mode === "quick") {
      initialSlides = [
        { label: "Verse 1", text: "Line 1 of song\nLine 2 of song" },
        { label: "Chorus", text: "Chorus line 1\nChorus line 2" },
      ];
    }
    const newSong = createSong({
      title,
      artist: "Unknown Artist",
      slides: initialSlides,
    });
    setSongName("");
    setHasTitleError(false);
    onSongCreated(newSong, mode);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New show"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1300,
        background: "var(--overlay-backdrop)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        style={{
          width: "min(520px, 94vw)",
          background: "var(--bg-surface)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "var(--fg-base)", fontFamily: "var(--font-sans)" }}>
            New Song
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              border: "1px solid var(--border-base)",
              background: "var(--bg-elevated)",
              color: "var(--fg-muted)",
              fontSize: "18px",
              fontWeight: 400,
              cursor: "pointer",
              padding: "2px 8px",
              borderRadius: "var(--radius-sm)",
              lineHeight: 1,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--color-primary)";
              e.currentTarget.style.color = "var(--fg-on-accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--bg-elevated)";
              e.currentTarget.style.color = "var(--fg-muted)";
            }}
          >
            x
          </button>
        </div>

        {/* Inputs */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Name Field */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label
              htmlFor="new-song-name-input"
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--color-primary)",
                fontFamily: "var(--font-sans)",
              }}
            >
              Name
            </label>
            <input
              id="new-song-name-input"
              autoFocus
              type="text"
              value={songName}
              placeholder="Enter song name..."
              aria-invalid={hasTitleError}
              onAnimationEnd={() => setHasTitleError(false)}
              onChange={(e) => {
                setSongName(e.target.value);
                if (e.target.value.trim()) setHasTitleError(false);
              }}
              style={{
                width: "100%",
                background: "var(--bg-base)",
                border: "none",
                borderBottom: `2px solid ${hasTitleError ? "var(--color-error)" : "var(--color-primary)"}`,
                borderRadius: "4px 4px 0 0",
                padding: "10px 12px",
                color: "var(--fg-base)",
                fontSize: "14px",
                fontFamily: "var(--font-sans)",
                outline: "none",
                animation: hasTitleError ? "new-song-title-ping 450ms ease-in-out" : undefined,
              }}
            />
          </div>
        </div>

        {/* Action Cards Container */}
        <div
          style={{
            background: "var(--bg-base)",
            borderRadius: "var(--radius-md)",
            padding: "16px",
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "14px",
          }}
        >
          {/* Quick lyrics */}
          <button
            type="button"
            onClick={() => handleSelectOption("quick")}
            style={actionCardStyle}
            onMouseEnter={cardHoverIn}
            onMouseLeave={cardHoverOut}
          >
            <div style={iconBoxStyle}>
              <span style={{ fontSize: "32px", fontWeight: 800, fontFamily: "serif", lineHeight: 1 }}>
                T<span style={{ fontSize: "24px" }}>T</span>
              </span>
            </div>
            <span data-song-card-label style={cardLabelStyle}>Quick lyrics</span>
          </button>

          {/* Web search */}
          <button
            type="button"
            onClick={() => handleSelectOption("search")}
            style={actionCardStyle}
            onMouseEnter={cardHoverIn}
            onMouseLeave={cardHoverOut}
          >
            <div style={iconBoxStyle}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <span data-song-card-label style={cardLabelStyle}>Web search</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

const actionCardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "12px",
  height: "140px",
  padding: "16px",
  background: "var(--bg-elevated)",
  border: "1px solid transparent",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  transition: "all 150ms ease",
  outline: "none",
  boxShadow: "none",
};

const iconBoxStyle: React.CSSProperties = {
  color: "var(--fg-base)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "48px",
};

const cardLabelStyle: React.CSSProperties = {
  color: "var(--fg-muted)",
  fontSize: "13px",
  fontWeight: 500,
  fontFamily: "var(--font-sans)",
};

function cardHoverIn(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.background = "var(--color-primary)";
  e.currentTarget.style.borderColor = "var(--color-primary)";
  const label = e.currentTarget.querySelector<HTMLElement>("[data-song-card-label]");
  if (label) label.style.color = "var(--fg-on-accent)";
  e.currentTarget.style.transform = "translateY(-2px)";
}

function cardHoverOut(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.background = "var(--bg-elevated)";
  e.currentTarget.style.borderColor = "var(--border-base)";
  const label = e.currentTarget.querySelector<HTMLElement>("[data-song-card-label]");
  if (label) label.style.color = "var(--fg-muted)";
  e.currentTarget.style.transform = "translateY(0)";
}
