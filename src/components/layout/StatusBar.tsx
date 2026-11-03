import { type CSSProperties, useEffect } from "react";

import { useMicMuteDetection } from "../../lib/micMuteDetection";
import { useAppUptime } from "../../app/useAppUptime";
import { useAudioStore } from "../../stores/audioStore";
import { useSessionStore } from "../../stores/sessionStore";
import { AudioDeviceSelector } from "./AudioDeviceSelector";
import { InputLevelMeter } from "./InputLevelMeter";
import { EngineModelBadge, MicStatusLabel, ModelProviderBadge } from "./StatusBarBadges";
import { DEFAULT_INPUT_DEVICES, STATUS_BAR_CSS, formatLatency, formatUptime } from "./statusBarUtils";

export interface StatusBarProps {
  inputName: string;
  inputDevices?: string[];
  onInputNameChange?: (inputName: string) => void;
  inputChannel?: number;
  inputChannelCount?: number;
  onInputChannelChange?: (channel: number) => void;
  audioStatus?: "disconnected" | "connected" | "capturing" | "error";
  audioError?: string | null;
  isSessionLive?: boolean;
  vadPercent: number;
  onVadPercentChange?: (vadPercent: number) => void;
  sampleRateLabel: string;
  engineVersion: string;
  /** Transcription model actually running, e.g. "base · cpu/int8" (SS-065). */
  engineModel?: string;
  /** True when the loader fell back to a smaller model than configured. */
  engineModelDegraded?: boolean;
  locationLabel: string;
  modelProvider?: { id: "groq" | "openai" | "anthropic" | "gemini"; label: string } | null;
}

export function StatusBar({
  inputName,
  inputDevices = DEFAULT_INPUT_DEVICES,
  onInputNameChange,
  inputChannel = 1,
  inputChannelCount = 1,
  onInputChannelChange,
  audioStatus = "disconnected",
  audioError = null,
  isSessionLive = false,
  vadPercent,
  onVadPercentChange,
  sampleRateLabel,
  engineVersion,
  engineModel = "",
  engineModelDegraded = false,
  locationLabel,
  modelProvider = null,
}: StatusBarProps) {
  const clampedVad = Math.min(100, Math.max(0, vadPercent));
  // Real input meter: a rolling history of measured levels, oldest → newest.
  // Read high-frequency audio values here so they do not re-render App.
  const levels = useAudioStore((state) => state.levels);
  const levelRms = useAudioStore((state) => state.levelRms);
  const levelPeak = useAudioStore((state) => state.levelPeak);
  const isSpeech = useAudioStore((state) => state.isSpeech);
  const decayMeter = useAudioStore((state) => state.decayMeter);
  const latencyMs = useSessionStore((state) => state.lastLatencyMs);
  const sessionUptimeSeconds = useSessionStore((state) => state.uptimeSeconds);
  const { appUptimeSeconds } = useAppUptime();
  const uptimeSeconds = Math.max(sessionUptimeSeconds, appUptimeSeconds);
  const activeInput = Boolean(inputName);
  const hasSignal = levels.some((value) => value > 0);
  const liveVisualsActive = isSessionLive && activeInput;
  const speechActive = activeInput && isSpeech;
  const permissionBlocked = audioError
    ? /(permission|access denied|not authorized|microphone)/i.test(audioError)
    : false;
  const isMicMuted = useMicMuteDetection(audioStatus === "capturing", levelRms, levelPeak);


  // Levels stop arriving when capture stops; tick the meter down so a frozen
  // reading is never mistaken for live input.
  useEffect(() => {
    if (!hasSignal) return;
    const timer = setInterval(decayMeter, 120);
    return () => clearInterval(timer);
  }, [decayMeter, hasSignal]);
  return (
    <footer
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "0 10px",
        height: "30px",
        background: "var(--bg-surface)",
        borderTop: "none",
        fontFamily: "var(--font-mono)",
        fontSize: "11px",
        color: "var(--fg-muted)",
        overflow: "visible",
        position: "relative",
        zIndex: 30,
      }}
    >
      <style>{STATUS_BAR_CSS}</style>
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
          <ModelProviderBadge modelProvider={modelProvider} />
        ) : null}
      </div>

      <div style={{ width: "1px", alignSelf: "stretch", background: "var(--border-base)" }} />

      <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: "1 1 auto" }}>
        <span style={{ color: "var(--fg-subtle)", letterSpacing: "0.05em" }}>INPUT</span>
        <AudioDeviceSelector
          inputName={inputName}
          inputDevices={inputDevices}
          onInputNameChange={onInputNameChange}
          inputChannel={inputChannel}
          inputChannelCount={inputChannelCount}
          onInputChannelChange={onInputChannelChange}
          activeInput={activeInput}
        />
        <MicStatusLabel
          audioStatus={audioStatus}
          audioError={audioError}
          isMicMuted={isMicMuted}
          permissionBlocked={permissionBlocked}
        />
        <InputLevelMeter
          levels={levels}
          hasSignal={hasSignal}
          speechActive={speechActive}
          activeInput={activeInput}
          isSpeech={isSpeech}
        />
        <span style={{ color: "var(--fg-subtle)" }}>|</span>
        <span style={{ color: "var(--fg-subtle)", letterSpacing: "0.05em" }}>VAD</span>
        <span style={{ color: "var(--fg-base)", minWidth: "34px" }}>{clampedVad}%</span>
        <input
          type="range"
          min={0}
          max={100}
          value={clampedVad}
          onChange={(event) => onVadPercentChange?.(Number(event.target.value))}
          aria-label="VAD threshold"
          className="ss-vad-range"
          style={{ "--ss-vad-percent": `${clampedVad}%` } as CSSProperties}
        />
      </div>

      <div style={{ width: "1px", alignSelf: "stretch", background: "var(--border-base)" }} />

      <div style={{ display: "flex", alignItems: "center", gap: "9px", minWidth: 0, flex: "0 1 auto" }}>
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
          <EngineModelBadge engineModel={engineModel} engineModelDegraded={engineModelDegraded} />
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
    </footer>
  );
}
