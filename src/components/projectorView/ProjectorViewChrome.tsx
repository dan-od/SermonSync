export function ProjectorViewHeader({ title, isLive }: { title: string; isLive: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "4px 4px 8px",
        marginBottom: "6px",
        borderBottom: "1px solid var(--projector-status-idle-border)",
        fontFamily: "var(--font-mono)",
        fontSize: "10px",
        color: "var(--fg-muted)",
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--projector-status-idle)" }} />
        {title}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span
          style={{
            border: isLive ? "none" : "1px solid var(--projector-status-idle-border)",
            borderRadius: "8px",
            padding: "2px 6px",
            background: isLive ? "var(--fg-on-accent)" : "transparent",
            color: isLive ? "var(--projector-status-live)" : "var(--projector-header-status-text)",
            fontSize: "9px",
            fontWeight: 700,
          }}
        >
          {isLive ? (
            <span style={{ animation: "ssOnAirBlink 1800ms ease-in-out infinite" }}>ON-AIR</span>
          ) : (
            "IDLE"
          )}
        </span>
      </span>
    </div>
  );
}

interface ProjectorVideoControlsProps {
  title: string;
  hasBackgroundVideo: boolean;
  isBackgroundVideoPlaying: boolean;
  isBackgroundVideoLooping: boolean;
  videoProgress: number;
  videoDuration: number;
  onTogglePlaying: () => void;
  onToggleLooping: () => void;
  onSeek: (time: number) => void;
}

export function ProjectorVideoControls({
  title,
  hasBackgroundVideo,
  isBackgroundVideoPlaying,
  isBackgroundVideoLooping,
  videoProgress,
  videoDuration,
  onTogglePlaying,
  onToggleLooping,
  onSeek,
}: ProjectorVideoControlsProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", minHeight: "28px", padding: "6px 4px 0", color: "var(--fg-muted)", fontFamily: "var(--font-mono)", fontSize: "10px" }}>
      <button
        type="button"
        onClick={onTogglePlaying}
        disabled={!hasBackgroundVideo}
        aria-label={isBackgroundVideoPlaying ? `Pause ${title} background video` : `Play ${title} background video`}
        title={isBackgroundVideoPlaying ? "Pause background video" : "Play background video"}
        style={{ width: "24px", height: "22px", border: "none", borderRadius: "var(--radius-sm)", background: "var(--bg-elevated)", color: "var(--fg-base)", cursor: hasBackgroundVideo ? "pointer" : "not-allowed", opacity: hasBackgroundVideo ? 1 : 0.42, fontSize: "12px", lineHeight: 1 }}
      >
        {isBackgroundVideoPlaying ? "Ⅱ" : "▶"}
      </button>
      <input
        type="range"
        min={0}
        max={videoDuration || 1}
        step="0.01"
        value={Math.min(videoProgress, videoDuration || 1)}
        disabled={!hasBackgroundVideo || videoDuration <= 0}
        onChange={(event) => onSeek(Number(event.target.value))}
        aria-label={`${title} background video progress`}
        style={{ flex: 1, minWidth: 0, accentColor: "var(--color-primary)", cursor: hasBackgroundVideo ? "pointer" : "not-allowed", opacity: hasBackgroundVideo ? 1 : 0.42 }}
      />
      <button
        type="button"
        onClick={onToggleLooping}
        disabled={!hasBackgroundVideo}
        aria-pressed={isBackgroundVideoLooping}
        aria-label={`${isBackgroundVideoLooping ? "Disable" : "Enable"} loop for ${title} background video`}
        title={isBackgroundVideoLooping ? "Loop on" : "Loop off"}
        style={{ width: "24px", height: "22px", border: "none", borderRadius: "var(--radius-sm)", background: isBackgroundVideoLooping ? "var(--color-primary-muted)" : "var(--bg-elevated)", color: isBackgroundVideoLooping ? "var(--color-primary)" : "var(--fg-muted)", cursor: hasBackgroundVideo ? "pointer" : "not-allowed", opacity: hasBackgroundVideo ? 1 : 0.42, fontSize: "15px", lineHeight: 1 }}
      >
        ↻
      </button>
    </div>
  );
}
