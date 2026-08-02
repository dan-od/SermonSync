import { useConfigStore } from "../../../stores/configStore";
import { IconGeneral } from "../icons";
import { SectionIntro, SettingsCard, TextRow, ToggleRow } from "../primitives";
import type { SettingsPanelState } from "../types";

interface GeneralTabProps {
  panelState: SettingsPanelState;
  onPanelChange: <K extends keyof SettingsPanelState>(key: K, value: SettingsPanelState[K]) => void;
}

export function GeneralTab({ panelState, onPanelChange }: GeneralTabProps) {
  const unitId = useConfigStore((s) => s.unitId);
  const unitName = useConfigStore((s) => s.unitName);
  const setUnit = useConfigStore((s) => s.setUnit);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <SectionIntro
        title="General"
        description="Church identity, locale defaults, and operator accessibility preferences. Church ID is issued by Foursquare HQ on first launch (PRD §8.1, §9)."
      />

      <SettingsCard icon={<IconGeneral />} title="Church Identity" subtitle="Used for authentication and denominational distribution">
        <TextRow label="Church ID" value={unitId} onChange={(value) => setUnit(value, unitName)} hint="Provided by Foursquare HQ. No account or password required." />
        <TextRow label="Branch / Unit Name" value={unitName} onChange={(value) => setUnit(unitId, value)} />
      </SettingsCard>

      <SettingsCard icon={<IconGeneral />} title="Accessibility & Display Defaults">
        <ToggleRow
          label="Use 24-hour clock"
          description="Format session timers and log timestamps in 24-hour time."
          checked={panelState.use24HourClock}
          onChange={(value) => onPanelChange("use24HourClock", value)}
        />
        <ToggleRow
          label="High contrast colors"
          description="Increase contrast across operator panels for bright media booths."
          checked={panelState.highContrastColors}
          onChange={(value) => onPanelChange("highContrastColors", value)}
        />
        <ToggleRow
          label="Disable suggestion labels"
          description="Hide theme/tag chips on detected verse cards in the suggestion deck."
          checked={panelState.disableSuggestionLabels}
          onChange={(value) => onPanelChange("disableSuggestionLabels", value)}
        />
      </SettingsCard>
    </div>
  );
}
