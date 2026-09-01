import { type CSSProperties, useEffect, useRef, useState } from "react";

import { useMicMuteDetection } from "../../lib/micMuteDetection";
import { METER_BARS, useAudioStore } from "../../stores/audioStore";

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
  onSync?: () => void;
  vadPercent: number;
  onVadPercentChange?: (vadPercent: number) => void;
  sampleRateLabel: string;
  engineVersion: string;
  /** Transcription model actually running, e.g. "base · cpu/int8" (SS-065). */
  engineModel?: string;
  /** True when the loader fell back to a smaller model than configured. */
  engineModelDegraded?: boolean;
  locationLabel: string;
  latencyMs?: number;
  uptimeSeconds?: number;
  levelRms?: number;
  levelPeak?: number;
  isSpeech?: boolean;
  modelProvider?: { id: "groq" | "openai" | "anthropic" | "gemini"; label: string } | null;
}

const DEFAULT_INPUT_DEVICES = ["Default Device", "Built-in Microphone", "USB Audio Interface"];

const MODEL_PROVIDER_COLORS: Record<string, string> = {
  groq: "#f97316",
  openai: "#10a37f",
  anthropic: "#d97757",
  gemini: "#4285f4",
};


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
  onSync,
  vadPercent,
  onVadPercentChange,
  sampleRateLabel,
  engineVersion,
  engineModel = "",
  engineModelDegraded = false,
  locationLabel,
  latencyMs = 0,
  uptimeSeconds = 0,
  levelRms = 0,
  levelPeak = 0,
  isSpeech = false,
  modelProvider = null,
}: StatusBarProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const channelDropdownRef = useRef<HTMLDivElement>(null);
  const [isInputMenuOpen, setIsInputMenuOpen] = useState(false);
  const [isChannelMenuOpen, setIsChannelMenuOpen] = useState(false);
  const clampedVad = Math.min(100, Math.max(0, vadPercent));
  // Real input meter: a rolling history of measured levels, oldest → newest.
  // isSpeech arrives as a prop; only the meter history is read from the store.
  const levels = useAudioStore((state) => state.levels);
  const decayMeter = useAudioStore((state) => state.decayMeter);
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
    const timer = setInterval(decayMeter, 120);
    return () => clearInterval(timer);
  }, [decayMeter]);

  useEffect(() => {
    if (!isInputMenuOpen && !isChannelMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!dropdownRef.current?.contains(target)) {
        setIsInputMenuOpen(false);
      }
      if (!channelDropdownRef.current?.contains(target)) {
        setIsChannelMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isChannelMenuOpen, isInputMenuOpen]);

  return (
    <footer
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "0 10px",
        height: "30px",
        background: "var(--bg-surface)",
        borderTop: "1px solid var(--border-base)",
        fontFamily: "var(--font-mono)",
        fontSize: "11px",
        color: "var(--fg-muted)",
        overflow: "visible",
        position: "relative",
        zIndex: 30,
      }}
    >
      <style>{`
        @keyframes ssLivePing {
          0% { box-shadow: 0 0 0 0 rgba(18, 214, 146, 0.5); }
          70% { box-shadow: 0 0 0 6px rgba(18, 214, 146, 0); }
          100% { box-shadow: 0 0 0 0 rgba(18, 214, 146, 0); }
        }

        .ss-vad-range {
          appearance: none;
          width: 84px;
          height: 16px;
          background: transparent;
          cursor: ew-resize;
        }

        .ss-vad-range::-webkit-slider-runnable-track {
          height: 4px;
          border-radius: 999px;
          background: linear-gradient(90deg, var(--color-primary) var(--ss-vad-percent), var(--border-base) var(--ss-vad-percent));
        }

        .ss-vad-range::-webkit-slider-thumb {
          appearance: none;
          width: 12px;
          height: 12px;
          margin-top: -4px;
          border-radius: 50%;
          border: 1px solid var(--border-base);
          background: var(--bg-surface);
          box-shadow: 0 0 10px rgba(123, 47, 247, 0.55);
        }

        .ss-vad-range::-moz-range-track {
          height: 4px;
          border-radius: 999px;
          background: var(--border-base);
        }

        .ss-vad-range::-moz-range-progress {
          height: 4px;
          border-radius: 999px;
          background: var(--color-primary);
        }

        .ss-vad-range::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          border: 1px solid var(--border-base);
          background: var(--bg-surface);
          box-shadow: 0 0 10px rgba(123, 47, 247, 0.55);
        }
      `}</style>
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

      <div style={{ width: "1px", alignSelf: "stretch", background: "var(--border-base)" }} />

      <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: "1 1 auto" }}>
        <span style={{ color: "var(--fg-subtle)", letterSpacing: "0.05em" }}>INPUT</span>
        <div ref={dropdownRef} style={{ position: "relative", minWidth: 0, flex: "0 1 172px" }}>
          <button
            type="button"
            onClick={() => setIsInputMenuOpen((current) => !current)}
            aria-haspopup="listbox"
            aria-expanded={isInputMenuOpen}
            style={{
              width: "100%",
              minWidth: 0,
              border: "none",
              borderRadius: "6px",
              background: "var(--bg-elevated)",
              color: "var(--fg-base)",
              fontFamily: "var(--font-sans)",
              fontSize: "12px",
              lineHeight: 1,
              padding: "5px 23px 5px 8px",
              cursor: "pointer",
              textAlign: "left",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              position: "relative",
            }}
          >
            {inputName}
            <span style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", color: "var(--fg-subtle)" }}>⌄</span>
          </button>
          {isInputMenuOpen ? (
            <div
              role="listbox"
              style={{
                position: "absolute",
                left: 0,
                bottom: "calc(100% + 6px)",
                zIndex: 20,
                width: "220px",
                border: "none",
                borderRadius: "8px",
                background: "var(--bg-elevated)",
                boxShadow: "var(--shadow-md)",
                padding: "4px",
              }}
            >
              {inputDevices.map((device) => {
                const selected = device === inputName;

                return (
                  <button
                    key={device}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onInputNameChange?.(device);
                      setIsInputMenuOpen(false);
                    }}
                    style={{
                      width: "100%",
                      border: "none",
                      borderRadius: "6px",
                      background: selected ? "var(--color-primary-muted)" : "transparent",
                      color: selected ? "var(--fg-base)" : "var(--fg-muted)",
                      fontFamily: "var(--font-sans)",
                      fontSize: "12px",
                      padding: "8px 9px",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    {device}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        <div ref={channelDropdownRef} style={{ position: "relative", flex: "0 0 52px" }}>
          <button
            type="button"
            onClick={() => setIsChannelMenuOpen((current) => !current)}
            disabled={!activeInput}
            aria-label="Input channel"
            aria-haspopup="listbox"
            aria-expanded={isChannelMenuOpen}
            style={{
              width: "100%",
              height: "24px",
              border: "none",
              borderRadius: "6px",
              background: "var(--bg-elevated)",
              color: activeInput ? "var(--fg-base)" : "var(--fg-subtle)",
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              lineHeight: 1,
              padding: "5px 16px 5px 6px",
              cursor: activeInput ? "pointer" : "not-allowed",
              textAlign: "left",
              position: "relative",
            }}
            title="Input channel"
          >
            CH {inputChannel}
            <span style={{ position: "absolute", right: "5px", top: "50%", transform: "translateY(-50%)", color: "var(--fg-subtle)" }}>⌄</span>
          </button>
          {isChannelMenuOpen ? (
            <div
              role="listbox"
              aria-label="Input channel"
              style={{
                position: "absolute",
                left: 0,
                bottom: "calc(100% + 6px)",
                zIndex: 20,
                width: "72px",
                border: "none",
                borderRadius: "8px",
                background: "var(--bg-elevated)",
                boxShadow: "var(--shadow-md)",
                padding: "4px",
              }}
            >
              {Array.from({ length: Math.max(1, inputChannelCount) }, (_, index) => index + 1).map((channel) => {
                const selected = channel === inputChannel;

                return (
                  <button
                    key={channel}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onInputChannelChange?.(channel);
                      setIsChannelMenuOpen(false);
                    }}
                    style={{
                      width: "100%",
                      border: "none",
                      borderRadius: "6px",
                      background: selected ? "var(--color-primary-muted)" : "transparent",
                      color: selected ? "var(--fg-base)" : "var(--fg-muted)",
                      fontFamily: "var(--font-mono)",
                      fontSize: "10px",
                      padding: "7px 6px",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    CH {channel}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
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
    </footer>
  );
}
