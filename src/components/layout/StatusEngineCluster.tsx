function formatUptime(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (value: number) => value.toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`;
}

function formatLatency(latencyMs: number) {
  return `${Math.max(0, Math.round(latencyMs))}ms`;
}

export function StatusEngineCluster({
  onSync,
  sampleRateLabel,
  latencyMs,
  uptimeSeconds,
  engineVersion,
  engineModel,
  engineModelDegraded,
  locationLabel,
}: {
  onSync?: () => void;
  sampleRateLabel: string;
  latencyMs: number;
  uptimeSeconds: number;
  engineVersion: string;
  engineModel: string;
  engineModelDegraded: boolean;
  locationLabel: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "9px", minWidth: 0, flex: "0 1 auto" }}>
      <span
        style={{
          padding: "2px 7px",
          borderRadius: "4px",
          background: "var(--bg-elevated)",
          color: "var(--fg-muted)",
          fontWeight: 700,
          letterSpacing: "0.04em",
          lineHeight: 1,
        }}
      >
        OFFLINE MODE
      </span>
      <button
        type="button"
        onClick={() => onSync?.()}
        style={{
          border: "none",
          borderRadius: "4px",
          background: "var(--bg-elevated)",
          color: "var(--fg-base)",
          padding: "2px 8px",
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.06em",
          lineHeight: 1,
          cursor: "pointer",
        }}
      >
        SYNC
      </button>
      <span style={{ color: "var(--fg-subtle)" }}>{sampleRateLabel}</span>
      <span style={{ color: "var(--fg-subtle)" }}>|</span>
      <span style={{ color: "var(--fg-subtle)", letterSpacing: "0.05em" }}>LAT</span>
      <span style={{ color: "var(--fg-base)" }}>{formatLatency(latencyMs)}</span>
      <span style={{ color: "var(--fg-subtle)" }}>|</span>
      <span style={{ color: "var(--fg-subtle)", letterSpacing: "0.05em" }}>UP</span>
      <span style={{ color: "var(--fg-base)" }}>{formatUptime(uptimeSeconds)}</span>
      <span
        style={{
          padding: "2px 6px",
          borderRadius: "4px",
          background: "var(--bg-elevated)",
          border: "none",
          color: "var(--fg-base)",
          lineHeight: 1,
        }}
      >
        {engineVersion}
      </span>
      {engineModel ? (
        <span
          title={
            engineModelDegraded
              ? "Transcription model DEGRADED — the configured model failed to load"
              : "Transcription model actually loaded (model · device/compute type)"
          }
          style={{
            padding: "2px 6px",
            borderRadius: "4px",
            background: "var(--bg-elevated)",
            border: engineModelDegraded ? "1px solid #e0563f" : "none",
            color: engineModelDegraded ? "#e0563f" : "var(--fg-muted)",
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          {engineModelDegraded ? "⚠ " : ""}
          {engineModel}
        </span>
      ) : null}
      <span
        style={{
          maxWidth: "240px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: "var(--fg-muted)",
          fontFamily: "var(--font-sans)",
          fontSize: "12px",
        }}
      >
        {locationLabel}
      </span>
    </div>
  );
}
