import { type CSSProperties, useEffect, useRef, useState } from "react";

import { useMicMuteDetection } from "../../lib/micMuteDetection";
import { useAudioStore } from "../../stores/audioStore";
import { statusBarCss } from "./statusBarChrome";
import { StatusEngineCluster } from "./StatusEngineCluster";
import { InputChannelPicker, InputDevicePicker } from "./StatusInputPickers";
import { InputLevelMeter, MicStatusBadge } from "./StatusInputSignal";
import { StatusLiveCluster } from "./StatusLiveCluster";

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
        borderTop: "none",
        fontFamily: "var(--font-mono)",
        fontSize: "11px",
        color: "var(--fg-muted)",
        overflow: "visible",
        position: "relative",
        zIndex: 30,
      }}
    >
      <style>{statusBarCss}</style>
      <StatusLiveCluster liveVisualsActive={liveVisualsActive} modelProvider={modelProvider} />

      <div style={{ width: "1px", alignSelf: "stretch", background: "var(--border-base)" }} />

      <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: "1 1 auto" }}>
        <span style={{ color: "var(--fg-subtle)", letterSpacing: "0.05em" }}>INPUT</span>
        <InputDevicePicker
          dropdownRef={dropdownRef}
          inputName={inputName}
          inputDevices={inputDevices}
          onInputNameChange={onInputNameChange}
          isInputMenuOpen={isInputMenuOpen}
          setIsInputMenuOpen={setIsInputMenuOpen}
        />
        <InputChannelPicker
          channelDropdownRef={channelDropdownRef}
          activeInput={activeInput}
          inputChannel={inputChannel}
          inputChannelCount={inputChannelCount}
          onInputChannelChange={onInputChannelChange}
          isChannelMenuOpen={isChannelMenuOpen}
          setIsChannelMenuOpen={setIsChannelMenuOpen}
        />
        <MicStatusBadge
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

      <StatusEngineCluster
        onSync={onSync}
        sampleRateLabel={sampleRateLabel}
        latencyMs={latencyMs}
        uptimeSeconds={uptimeSeconds}
        engineVersion={engineVersion}
        engineModel={engineModel}
        engineModelDegraded={engineModelDegraded}
        locationLabel={locationLabel}
      />
    </footer>
  );
}
