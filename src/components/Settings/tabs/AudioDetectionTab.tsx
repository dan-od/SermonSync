import { IconMic } from "../icons";
import { InfoBanner, RadioCardGroup, SectionIntro, SelectRow, SettingsCard, SliderRow } from "../primitives";
import { MOCK_AUDIO_INPUTS, type SettingsPanelState, type SttMode } from "../types";

interface AudioDetectionTabProps {
  panelState: SettingsPanelState;
  onPanelChange: <K extends keyof SettingsPanelState>(key: K, value: SettingsPanelState[K]) => void;
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

export function AudioDetectionTab({ panelState, onPanelChange }: AudioDetectionTabProps) {
  const levelPercent = Math.max(0, Math.min(100, Math.round(((panelState.audioLevelDb + 60) / 60) * 100)));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <SectionIntro
        title="Audio & Scripture Detection"
        description="Configure the audio input feeding the speech-to-text pipeline and tune the offline detection engine (PRD §5.1, §5.5)."
      />

      <SettingsCard icon={<IconMic />} title="Audio Input" subtitle="Any system audio input via CPAL">
        <SelectRow
          label="Input Device"
          value={panelState.audioInputDeviceId}
          options={MOCK_AUDIO_INPUTS.map((input) => ({ value: input.id, label: input.label }))}
          onChange={(value) => onPanelChange("audioInputDeviceId", value)}
          hint="Minimum viable setup: laptop's built-in mic pointed at the speaker. Best: direct feed from mixing board."
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
        </div>
      </SettingsCard>

      <SettingsCard icon={<IconMic />} title="Speech-to-Text Engine">
        <RadioCardGroup options={STT_MODE_OPTIONS} value={panelState.sttMode} onChange={(value) => onPanelChange("sttMode", value)} columns={1} />
      </SettingsCard>

      <SettingsCard icon={<IconMic />} title="Worship / Speech Detector & Auto-Send">
        <SliderRow
          label="Worship detector sensitivity"
          description="Custom energy-based FFT detector — pauses transcription automatically when singing starts."
          value={panelState.worshipDetectorSensitivity}
          min={0}
          max={100}
          unit="%"
          onChange={(value) => onPanelChange("worshipDetectorSensitivity", value)}
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
