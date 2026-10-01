export function SongStudioHeader({
  title,
  setTitle,
  artist,
  setArtist,
  hasTaggedSections,
  openCueBuilder,
  handleSave,
  handleClose,
}: {
  title: string;
  setTitle: (value: string) => void;
  artist: string;
  setArtist: (value: string) => void;
  hasTaggedSections: boolean;
  openCueBuilder: () => void;
  handleSave: () => void;
  handleClose: () => void;
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        borderBottom: "1px solid var(--border-base)",
        padding: "12px 18px",
        background: "var(--bg-surface)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: 1 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ color: "var(--fg-base)", fontWeight: 700, fontSize: "14px" }}>
            Song Studio
          </span>
          <span style={{ color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.06em" }}>
            EDIT SONG & SLIDES
          </span>
        </div>

        {/* Title Input */}
        <input
          type="text"
          value={title}
          placeholder="Song Title"
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Song title"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-base)",
            borderRadius: "6px",
            padding: "6px 10px",
            color: "var(--fg-base)",
            fontSize: "13px",
            fontWeight: 600,
            outline: "none",
            width: "220px",
          }}
        />

        {/* Artist Input */}
        <input
          type="text"
          value={artist}
          placeholder="Artist"
          onChange={(e) => setArtist(e.target.value)}
          aria-label="Artist name"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-base)",
            borderRadius: "6px",
            padding: "6px 10px",
            color: "var(--fg-muted)",
            fontSize: "13px",
            outline: "none",
            width: "180px",
          }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <button
          type="button"
          onClick={openCueBuilder}
          disabled={!hasTaggedSections}
          style={{
            border: "1px solid var(--color-primary)",
            background: "var(--color-primary-muted)",
            color: "var(--color-primary)",
            borderRadius: "var(--radius-sm)",
            padding: "8px 12px",
            fontWeight: 600,
            fontSize: "12px",
            cursor: !hasTaggedSections ? "not-allowed" : "pointer",
            opacity: !hasTaggedSections ? 0.5 : 1,
            transition: "background 120ms ease, color 120ms ease",
          }}
          onMouseEnter={(event) => {
            if (hasTaggedSections) {
              event.currentTarget.style.background = "var(--color-primary)";
              event.currentTarget.style.color = "var(--fg-on-accent)";
            }
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.background = "var(--color-primary-muted)";
            event.currentTarget.style.color = "var(--color-primary)";
          }}
        >
          Create projection cue
        </button>
        <button
          type="button"
          onClick={handleSave}
          style={{
            border: "none",
            background: "var(--color-primary)",
            color: "var(--fg-on-accent)",
            borderRadius: "8px",
            padding: "8px 16px",
            fontWeight: 700,
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          Save
        </button>
        <button
          type="button"
          onClick={handleClose}
          style={{
            border: "none",
            background: "var(--bg-elevated)",
            color: "var(--fg-base)",
            borderRadius: "6px",
            width: "30px",
            height: "30px",
            cursor: "pointer",
            fontSize: "16px",
            display: "grid",
            placeItems: "center",
          }}
          title="Close without saving"
          aria-label="Close without saving"
        >
          ×
        </button>
      </div>
    </header>
  );
}
