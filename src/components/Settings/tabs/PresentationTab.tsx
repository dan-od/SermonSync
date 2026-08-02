import { IconLayout } from "../icons";
import { ChipEditor, SectionIntro, SelectRow, SettingsCard } from "../primitives";
import type { SettingsPanelState } from "../types";

interface PresentationTabProps {
  panelState: SettingsPanelState;
  onPanelChange: <K extends keyof SettingsPanelState>(key: K, value: SettingsPanelState[K]) => void;
}

const FALLBACK_VERSIONS = ["KJV", "ASV", "WEB", "YOR", "HAU", "IGB"];

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

      <SettingsCard icon={<IconLayout />} title="Operator Hotkeys" subtitle="Fixed reference — not yet remappable">
        <HotkeyRow action="Send verse to live" keys="Enter" />
        <HotkeyRow action="Dismiss suggestion" keys="Esc" />
        <HotkeyRow action="Black screen output" keys="B" />
        <HotkeyRow action="Clear text overlay" keys="C" />
      </SettingsCard>
    </div>
  );
}

function HotkeyRow({ action, keys }: { action: string; keys: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-xs)", color: "var(--fg-muted)", fontFamily: "var(--font-mono)" }}>
      <span>{action}</span>
      <span
        style={{
          background: "var(--bg-elevated)",
          borderRadius: "var(--radius-sm)",
          padding: "2px 8px",
          fontSize: "10px",
          color: "var(--fg-base)",
        }}
      >
        {keys}
      </span>
    </div>
  );
}
