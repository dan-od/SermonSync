import type { TransitionPresetId } from "./transitionPresets";

export function TransitionPresetButtons({ onApplyPreset }: { onApplyPreset: (preset: TransitionPresetId) => void }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        borderRadius: "var(--radius-lg)",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--fg-muted)",
          }}
        >
          GLOBAL TRANSITION PRESETS
        </span>
        <span style={{ fontSize: "10px", color: "var(--fg-subtle)" }}>Applies configured profiles to all 6 categories</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {[
          {
            id: "cinematic",
            label: "Cinematic Smooth",
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M2 8h20M6 4l3 4M11 4l3 4M16 4l3 4" />
              </svg>
            ),
          },
          {
            id: "punchy",
            label: "Punchy & Dynamic",
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            ),
          },
          {
            id: "broadcast",
            label: "Classic Broadcast",
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="7" width="20" height="13" rx="2" />
                <polyline points="17 2 12 7 7 2" />
              </svg>
            ),
          },
          {
            id: "cut",
            label: "Instant Cut",
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="6" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <line x1="20" y1="4" x2="8.12" y2="15.88" />
                <line x1="14.47" y1="14.47" x2="20" y2="20" />
                <line x1="8.12" y1="8.12" x2="12" y2="12" />
              </svg>
            ),
          },
          {
            id: "default",
            label: "Reset Defaults",
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            ),
          },
        ].map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onApplyPreset(preset.id as TransitionPresetId)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              border: "none",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-elevated)",
              color: "var(--fg-base)",
              padding: "6px 12px",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-xs)",
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 150ms ease, color 150ms ease",
            }}
          >
            {preset.icon}
            <span>{preset.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
