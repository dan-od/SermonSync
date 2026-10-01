import { METER_BARS } from "../../stores/audioStore";
import type { StatusBarProps } from "./StatusBar";

export function MicStatusBadge({
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

export function InputLevelMeter({
  levels,
  hasSignal,
  speechActive,
  activeInput,
  isSpeech,
}: {
  levels: number[];
  hasSignal: boolean;
  speechActive: boolean;
  activeInput: boolean;
  isSpeech: boolean;
}) {
  return (
    <div
      aria-label={
        hasSignal
          ? `Input level ${Math.round((levels[levels.length - 1] ?? 0) * 100)}%${speechActive ? ", speech detected" : ""}`
          : "No input signal"
      }
      title={speechActive ? "Speech detected" : hasSignal ? "Input signal (no speech)" : "No input signal"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "2px",
        height: "22px",
        padding: "0 2px",
      }}
    >
      {Array.from({ length: METER_BARS }, (_, index) => {
        const level = levels[index] ?? 0;
        // 2px floor so the meter reads as present-but-silent, not absent.
        const height = 2 + level * 20;
        return (
          <span
            key={index}
            style={{
              width: "3px",
              height: `${height}px`,
              borderRadius: "999px",
              background: !activeInput
                ? "var(--border-base)"
                : isSpeech
                  ? "linear-gradient(180deg, #d6c2ff, #7b2ff7)"
                  : "linear-gradient(180deg, #6f5a9c, #4a3572)",
              transformOrigin: "bottom",
              transition: "height 90ms linear, background 150ms linear",
            }}
          />
        );
      })}
    </div>
  );
}
