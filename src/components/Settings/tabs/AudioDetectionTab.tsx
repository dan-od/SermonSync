import { IconMic } from "../icons";
import { InfoBanner, RadioCardGroup, SectionIntro, SelectRow, SettingsCard, SliderRow } from "../primitives";
import { computeAudioAmplitude } from "../../../lib/audioLevel";
import { useMicMuteDetection } from "../../../lib/micMuteDetection";
import type { AudioInputDevice, AudioStatus } from "../../../types/state";
import type { SettingsPanelState, SttMode } from "../types";

interface AudioDetectionTabProps {
  panelState: SettingsPanelState;
  onPanelChange: <K extends keyof SettingsPanelState>(key: K, value: SettingsPanelState[K]) => void;
  audioDevices: AudioInputDevice[];
  selectedDevice: AudioInputDevice | null;
  inputChannel: number;
  audioStatus: AudioStatus;
  audioError: string | null;
  levelRms: number;
  levelPeak: number;
  vadSensitivity: number;
  onAudioDeviceChange: (name: string) => void;
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
    label: "High Quality — Whisper Tiny",
    description: "75MB, CPU-only, ~2-4s per chunk. For churches with better hardware.",
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
  levelRms,
  levelPeak,
  vadSensitivity,
  onAudioDeviceChange,
  onAudioChannelChange,
  onVadSensitivityChange,
}: AudioDetectionTabProps) {
  const levelPercent = Math.round(computeAudioAmplitude(levelRms, levelPeak) * 100);
  const isMicMuted = useMicMuteDetection(audioStatus === "capturing", levelRms, levelPeak);

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
            onPanelChange("audioInputDeviceId", value);
            onAudioDeviceChange(value);
          }}
          hint="Minimum viable setup: laptop's built-in mic pointed at the speaker. Best: direct feed from mixing board."
        />
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
