import { MODEL_PROVIDER_COLORS } from "./statusBarUtils";
import type { StatusBarProps } from "./StatusBar";

export function ModelProviderBadge({ modelProvider }: { modelProvider: NonNullable<StatusBarProps["modelProvider"]> }) {
  return (
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
  );
}

export function MicStatusLabel({
  audioStatus,
  audioError,
  isMicMuted,
  permissionBlocked,
}: {
  audioStatus: NonNullable<StatusBarProps["audioStatus"]>;
  audioError: string | null;
  isMicMuted: boolean;
  permissionBlocked: boolean;
}) {
  return (
    <span
      title={
        audioError ??
        (audioStatus === "capturing"
          ? isMicMuted
            ? "No audio detected from this input — check that the microphone is not muted."
            : "Microphone permission granted and audio capture is active."
          : "Microphone permission has not been verified.")
      }
      style={{
        color:
          audioStatus === "capturing"
            ? isMicMuted
              ? "var(--color-warning)"
              : "var(--color-success)"
            : audioStatus === "error"
              ? "var(--color-error)"
              : "var(--fg-subtle)",
        fontSize: "9px",
        fontWeight: 700,
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
      }}
    >
      {audioStatus === "capturing"
        ? isMicMuted
          ? "MIC MUTED"
          : "MIC READY"
        : permissionBlocked
          ? "MIC BLOCKED"
          : audioStatus === "error"
            ? "MIC ERROR"
            : "MIC CHECK"}
    </span>
  );
}

export function EngineModelBadge({ engineModel, engineModelDegraded }: { engineModel: string; engineModelDegraded: boolean }) {
  return (
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
  );
}
