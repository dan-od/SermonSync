import { IconPalette } from "../icons";
import { InfoBanner, RadioCardGroup, SectionIntro, SettingsCard } from "../primitives";
import type { UiTheme } from "../../../types/state";

const THEME_OPTIONS: { value: UiTheme; label: string; description: string }[] = [
  { value: "dark", label: "Dark (Default)", description: "Dark-first operator console optimized for low-lit media booths." },
  { value: "light", label: "Light", description: "Light surface palette for bright rooms or projector-facing daylight setups." },
];

interface ThemeTabProps {
  theme: UiTheme;
  onThemeChange: (theme: UiTheme) => void;
}

export function ThemeTab({ theme, onThemeChange }: ThemeTabProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <SectionIntro title="Theme & Appearance" description="Desktop window styling for the operator console. Does not affect projector output styling." />

      <SettingsCard icon={<IconPalette />} title="Interface Theme">
        <RadioCardGroup options={THEME_OPTIONS} value={theme} onChange={onThemeChange} columns={1} />
        <InfoBanner>
          A third "Midnight" (deep blue accent) theme is available in tokens but not yet exposed as a toggle — planned
          for a future release alongside slide templates (PRD §10, Phase 3).
        </InfoBanner>
      </SettingsCard>
    </div>
  );
}
