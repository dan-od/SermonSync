import type { StatusBarProps } from "./StatusBar";

const MODEL_PROVIDER_COLORS: Record<string, string> = {
  groq: "#f97316",
  openai: "#10a37f",
  anthropic: "#d97757",
  gemini: "#4285f4",
};

export function StatusLiveCluster({
  liveVisualsActive,
  modelProvider,
}: {
  liveVisualsActive: boolean;
  modelProvider: StatusBarProps["modelProvider"];
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: "0 0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "5px",
          background: "var(--color-success-muted)",
          color: "var(--color-success)",
          border: "none",
          borderRadius: "4px",
          padding: "2px 7px",
          lineHeight: 1,
        }}
      >
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: "var(--color-success)",
            animation: liveVisualsActive ? "ssLivePing 1.4s ease-out infinite" : "none",
          }}
        />
        <span style={{ fontWeight: 700, letterSpacing: "0.04em" }}>LIVE</span>
      </div>
      <span style={{ color: "var(--fg-subtle)" }}>DB</span>
      <span style={{ color: "var(--fg-base)" }}>SQLite</span>
      {modelProvider ? (
        <div
          title={`Default model provider: ${modelProvider.label}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            background: `${MODEL_PROVIDER_COLORS[modelProvider.id] ?? "var(--color-primary)"}26`,
            color: MODEL_PROVIDER_COLORS[modelProvider.id] ?? "var(--color-primary)",
            border: "none",
            borderRadius: "4px",
            padding: "2px 7px",
            lineHeight: 1,
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: MODEL_PROVIDER_COLORS[modelProvider.id] ?? "var(--color-primary)",
            }}
          />
          <span style={{ fontWeight: 700, letterSpacing: "0.04em" }}>{modelProvider.label.toUpperCase()}</span>
        </div>
      ) : null}
    </div>
  );
}
