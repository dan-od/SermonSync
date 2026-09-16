import { IconLayout } from "../icons";
import { ChipEditor, SectionIntro, SelectRow, SettingsCard } from "../primitives";
import type { SettingsPanelState } from "../types";

interface PresentationTabProps {
  panelState: SettingsPanelState;
  onPanelChange: <K extends keyof SettingsPanelState>(key: K, value: SettingsPanelState[K]) => void;
}

const FALLBACK_VERSIONS = ["ENGLISHNKJ"];

export function PresentationTab({ panelState, onPanelChange }: PresentationTabProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <SectionIntro
        title="Basic Presentation"
        description="Manual verse search and simple text slides — the fallback path for when the AI misses a reference, and everything a brand-new church plant needs to run a full service (PRD §5.3)."
      />

      <SettingsCard icon={<IconLayout />} title="Simple Text Slide Groups" subtitle="Categorize quick announcement slides">
        <ChipEditor
          items={panelState.slideGroups}
          onAdd={(value) => onPanelChange("slideGroups", [...panelState.slideGroups, value])}
          onRemove={(value) => onPanelChange("slideGroups", panelState.slideGroups.filter((g) => g !== value))}
          placeholder="e.g. Communion, Baptism..."
        />
      </SettingsCard>

      <SettingsCard icon={<IconLayout />} title="Manual Verse Search">
        <SelectRow
          label="Fallback display version"
          value={panelState.manualSearchFallbackVersion}
          options={FALLBACK_VERSIONS.map((v) => ({ value: v, label: v }))}
          onChange={(value) => onPanelChange("manualSearchFallbackVersion", value)}
          hint="Used when typing a reference manually to display it (fallback for when AI misses)."
        />
      </SettingsCard>

    </div>
  );
}
