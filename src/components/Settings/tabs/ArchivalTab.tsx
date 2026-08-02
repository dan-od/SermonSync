import { IconArchive } from "../icons";
import { InfoBanner, RadioCardGroup, SectionIntro, SettingsCard, SliderRow, TextRow, ToggleRow } from "../primitives";
import type { DevotionalExportFormat, SettingsPanelState } from "../types";

interface ArchivalTabProps {
  panelState: SettingsPanelState;
  onPanelChange: <K extends keyof SettingsPanelState>(key: K, value: SettingsPanelState[K]) => void;
}

const EXPORT_FORMAT_OPTIONS: { value: DevotionalExportFormat; label: string; description: string }[] = [
  { value: "pdf", label: "PDF", description: "Formatted document, ready to print or share with the congregation." },
  { value: "text", label: "Plain Text", description: "Lightweight text file for pasting into bulletins or chat groups." },
];

export function ArchivalTab({ panelState, onPanelChange }: ArchivalTabProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <SectionIntro
        title="Archival & Session Data"
        description="Session transcripts feed cross-service callbacks and post-service devotional generation (PRD §5.2, §8.3)."
      />

      <SettingsCard icon={<IconArchive />} title="Local Archive">
        <ToggleRow
          label="Enable local archival"
          description="Save session transcripts and cited scriptures to disk for future cross-service callbacks."
          checked={panelState.enableLocalArchival}
          onChange={(value) => onPanelChange("enableLocalArchival", value)}
        />
        <TextRow
          label="Archive directory"
          value={panelState.localArchiveDirectory}
          onChange={(value) => onPanelChange("localArchiveDirectory", value)}
        />
        <SliderRow
          label="Retention period"
          description="Older session archives are pruned automatically."
          value={panelState.retentionDays}
          min={30}
          max={730}
          step={30}
          unit=" days"
          onChange={(value) => onPanelChange("retentionDays", value)}
        />
      </SettingsCard>

      <SettingsCard icon={<IconArchive />} title="Post-Service Devotional Export">
        <RadioCardGroup
          options={EXPORT_FORMAT_OPTIONS}
          value={panelState.devotionalExportFormat}
          onChange={(value) => onPanelChange("devotionalExportFormat", value)}
          columns={2}
        />
        <InfoBanner>Devotional generation requires the online intelligence layer (Groq API key) to be enabled.</InfoBanner>
      </SettingsCard>
    </div>
  );
}
