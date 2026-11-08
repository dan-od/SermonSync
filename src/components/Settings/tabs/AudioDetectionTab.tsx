import { useCallback, useState } from "react";
import { IconMic } from "../icons";
import { InfoBanner, RadioCardGroup, SectionIntro, SelectRow, SettingsCard, SliderRow } from "../primitives";
import { computeAudioAmplitude } from "../../../lib/audioLevel";
import { useMicMuteDetection } from "../../../lib/micMuteDetection";
import { useAudioStore } from "../../../stores/audioStore";
import { getSidecarHttpBase } from "../../../lib/sidecarClient";
import type { AudioInputDevice, AudioStatus } from "../../../types/state";
import type { SettingsPanelState, SttMode, WhisperModel } from "../types";

interface AudioDetectionTabProps {
  panelState: SettingsPanelState;
  onPanelChange: <K extends keyof SettingsPanelState>(key: K, value: SettingsPanelState[K]) => void;
  audioDevices: AudioInputDevice[];
  selectedDevice: AudioInputDevice | null;
  inputChannel: number;
  audioStatus: AudioStatus;
  audioError: string | null;
  vadSensitivity: number;
  onAudioDeviceChange: (name: string) => void;
  onAudioDevicesRefresh: () => Promise<void>;
  onAudioChannelChange: (channel: number) => void;
  onVadSensitivityChange: (value: number) => void;
}

const STT_MODE_OPTIONS: { value: SttMode; label: string; description: string }[] = [
  {
    value: "moonshine",
    label: "Offline — Moonshine Base",
    description: "58MB, CPU-only, ~50ms latency. Default for any Windows laptop (PRD §7.2).",
  },
  {
    value: "whisper",
    label: "High Quality — Whisper",
    description: "GPU-accelerated (Metal on Mac, CUDA on Windows). Best accuracy.",
  },
];

const WHISPER_MODEL_OPTIONS: { value: WhisperModel; label: string; description: string }[] = [
  {
    value: "large-v3-turbo",
    label: "Large V3 Turbo (Recommended)",
    description: "809M params. Best accuracy-to-speed ratio. ~1.5GB download.",
  },
  {
    value: "base",
    label: "Base",
    description: "74M params. Fast, lower accuracy. Good for testing.",
  },
  {
    value: "tiny",
    label: "Tiny",
    description: "39M params. Fastest, lowest accuracy. Dev/debug only.",
  },
];

export function AudioDetectionTab({
  panelState,
  onPanelChange,
  audioDevices,
  selectedDevice,
  inputChannel,
  audioStatus,
  audioError,
  vadSensitivity,
  onAudioDeviceChange,
  onAudioDevicesRefresh,
  onAudioChannelChange,
  onVadSensitivityChange,
}: AudioDetectionTabProps) {
  const levelRms = useAudioStore((state) => state.levelRms);
  const levelPeak = useAudioStore((state) => state.levelPeak);
  const levelPercent = Math.round(computeAudioAmplitude(levelRms, levelPeak) * 100);
  const isMicMuted = useMicMuteDetection(audioStatus === "capturing", levelRms, levelPeak);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const scanAudioDevices = async () => {
    if (isScanning) return;
    setIsScanning(true);
    setScanError(null);
    try {
      await onAudioDevicesRefresh();
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "Could not scan audio input devices.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleWhisperModelChange = useCallback(
    (value: WhisperModel) => {
      onPanelChange("whisperModel", value);
      fetch(`${getSidecarHttpBase()}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "whisper.model", value }),
      }).catch(() => undefined);
    },
    [onPanelChange],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <SectionIntro
        title="Audio & Scripture Detection"
        description="Configure the audio input feeding the speech-to-text pipeline and tune the offline detection engine (PRD §5.1, §5.5)."
      />

      <SettingsCard
        icon={<IconMic />}
        title="Audio Input"
        subtitle={
          audioStatus === "capturing"
            ? isMicMuted
              ? "Capture is active but no audio is coming through — check that the microphone is not muted"
              : "Microphone permission granted and capture is active"
            : audioError ?? "Select an input to verify microphone access"
        }
      >
        <SelectRow
          label="Input Device"
          value={selectedDevice?.name ?? panelState.audioInputDeviceId}
          options={audioDevices.map((device) => ({ value: device.name, label: `${device.name} (${device.defaultSampleRate} Hz)` }))}
          onChange={(value) => {
            if (!value || isScanning) return;
            onPanelChange("audioInputDeviceId", value);
            onAudioDeviceChange(value);
          }}
          hint="Minimum viable setup: laptop's built-in mic pointed at the speaker. Best: direct feed from mixing board."
        />
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <button
            type="button"
            onClick={() => void scanAudioDevices()}
            disabled={isScanning || audioStatus === "capturing"}
            style={{ border: "none", borderRadius: "var(--radius-md)", padding: "8px 10px", background: "var(--bg-elevated)", color: "var(--fg-base)", cursor: isScanning || audioStatus === "capturing" ? "not-allowed" : "pointer", fontSize: "11px", opacity: isScanning || audioStatus === "capturing" ? 0.6 : 1 }}
          >
            {isScanning ? "Scanning…" : "Scan for audio input devices"}
          </button>
          <span role="status" style={{ color: "var(--fg-subtle)", fontSize: "11px" }}>
            {audioDevices.length} input device{audioDevices.length === 1 ? "" : "s"} found
          </span>
        </div>
        {scanError ? <InfoBanner tone="warning">{scanError}</InfoBanner> : null}
        {audioStatus === "capturing" ? <InfoBanner tone="warning">Pause the session before scanning so the live input is not interrupted.</InfoBanner> : null}
        <SelectRow
          label="Input Channel"
          value={String(inputChannel)}
          options={Array.from({ length: selectedDevice?.channels ?? 1 }, (_, index) => ({
            value: String(index + 1),
            label: `Channel ${index + 1}`,
          }))}
          onChange={(value) => onAudioChannelChange(Number(value))}
          hint="Choose the channel count sent to the capture stream."
        />
        <div>
          <p style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--fg-subtle)", fontFamily: "var(--font-mono)" }}>
            Input Level Meter
          </p>
          <div style={{ height: "10px", borderRadius: "var(--radius-full)", background: "var(--bg-base)", overflow: "hidden" }}>
            <div
              style={{
                width: `${levelPercent}%`,
                height: "100%",
                background: levelPercent > 85 ? "var(--color-error)" : "var(--color-success)",
                transition: "width 200ms ease",
              }}
            />
          </div>
          <div style={{ marginTop: "6px", color: isMicMuted ? "var(--color-warning)" : "var(--fg-subtle)", fontFamily: "var(--font-mono)", fontSize: "10px" }}>
            {audioStatus === "capturing" ? (isMicMuted ? "MIC MUTED" : "MIC READY") : audioStatus === "error" ? "MIC ERROR" : "MIC CHECK"}
          </div>
        </div>
      </SettingsCard>

      <SettingsCard icon={<IconMic />} title="Speech-to-Text Engine">
        <RadioCardGroup options={STT_MODE_OPTIONS} value={panelState.sttMode} onChange={(value) => onPanelChange("sttMode", value)} columns={1} />
      </SettingsCard>

      {panelState.sttMode === "whisper" && (
        <SettingsCard icon={<IconMic />} title="Whisper Model">
          <RadioCardGroup
            options={WHISPER_MODEL_OPTIONS}
            value={panelState.whisperModel}
            onChange={(value) => handleWhisperModelChange(value as WhisperModel)}
            columns={1}
          />
          <InfoBanner>
            Changing the model takes effect on next sidecar restart. Mac uses Metal (mlx-whisper); Windows uses CUDA (faster-whisper).
          </InfoBanner>
        </SettingsCard>
      )}

      <SettingsCard icon={<IconMic />} title="Worship / Speech Detector & Auto-Send">
        <SliderRow
          label="Speech detector sensitivity"
          description="Controls the RMS threshold used to decide whether audio is speech. Higher values detect quieter speech."
          value={Math.round(vadSensitivity * 100)}
          min={0}
          max={100}
          unit="%"
          onChange={(value) => onVadSensitivityChange(value / 100)}
        />
        <SliderRow
          label="Auto-send confidence threshold"
          description="Verse cards above this confidence score are sent to the projector automatically."
          value={panelState.autoSendConfidenceThreshold}
          min={0}
          max={100}
          unit="%"
          onChange={(value) => onPanelChange("autoSendConfidenceThreshold", value)}
        />
        <InfoBanner>
          Explicit references ("John 3:16") are matched via trie in microseconds. Loose paraphrases fall back to the
          keyword index, then to the online Groq matcher if enabled.
        </InfoBanner>
      </SettingsCard>
    </div>
  );
}
