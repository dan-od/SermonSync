import { IconMonitor } from "../icons";
import { InfoBanner, RadioCardGroup, SectionIntro, SelectRow, SettingsCard, SliderRow, TextRow, ToggleRow } from "../primitives";
import { MOCK_DISPLAYS, type IdleScreenMode, type SettingsPanelState } from "../types";

interface DisplayMiddlewareTabProps {
  panelState: SettingsPanelState;
  onPanelChange: <K extends keyof SettingsPanelState>(key: K, value: SettingsPanelState[K]) => void;
}

const IDLE_SCREEN_OPTIONS: { value: IdleScreenMode; label: string; description: string }[] = [
  { value: "logo", label: "Church Logo", description: "Show the uploaded church logo when no verse is active." },
  { value: "background", label: "Background Image", description: "Show a custom uploaded background image." },
  { value: "color", label: "Solid Color", description: "Show a plain configurable color fill." },
];

export function DisplayMiddlewareTab({ panelState, onPanelChange }: DisplayMiddlewareTabProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <SectionIntro
        title="Display & Middleware Output"
        description="EasyWorship-style display takeover for standalone churches, or feed content into OBS/EasyWorship/ProPresenter as middleware (PRD §5.3, §5.4)."
      />

      <SettingsCard icon={<IconMonitor />} title="Output Display" subtitle="Any resolution, hot-plug supported">
        <SelectRow
          label="Active Output Display"
          value={panelState.outputDisplayId}
          options={MOCK_DISPLAYS.map((d) => ({ value: d.id, label: `${d.label} — ${d.resolution}` }))}
          onChange={(value) => onPanelChange("outputDisplayId", value)}
        />
        <SliderRow
          label="Default projector font size"
          value={panelState.defaultProjectorFontSizePx}
          min={24}
          max={96}
          step={2}
          unit="px"
          onChange={(value) => onPanelChange("defaultProjectorFontSizePx", value)}
        />
      </SettingsCard>

      <SettingsCard icon={<IconMonitor />} title="Idle Screen">
        <RadioCardGroup
          options={IDLE_SCREEN_OPTIONS}
          value={panelState.idleScreenMode}
          onChange={(value) => onPanelChange("idleScreenMode", value)}
          columns={1}
        />
        {panelState.idleScreenMode === "color" ? (
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <input
              type="color"
              value={panelState.idleScreenColor}
              onChange={(e) => onPanelChange("idleScreenColor", e.target.value)}
              style={{ width: "40px", height: "32px", borderRadius: "var(--radius-md)", background: "none", cursor: "pointer" }}
            />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
              {panelState.idleScreenColor}
            </span>
          </div>
        ) : null}
      </SettingsCard>

      <SettingsCard icon={<IconMonitor />} title="Middleware Outputs" subtitle="All can run simultaneously alongside standalone mode">
        <ToggleRow
          label="Web canvas"
          description="Add as a browser source in OBS or EasyWorship."
          checked={panelState.webCanvasEnabled}
          onChange={(value) => onPanelChange("webCanvasEnabled", value)}
        />
        {panelState.webCanvasEnabled ? (
          <TextRow
            label="Web canvas port"
            value={String(panelState.webCanvasPort)}
            onChange={(value) => onPanelChange("webCanvasPort", Number(value) || 8080)}
            hint={`Accessible locally at http://localhost:${panelState.webCanvasPort}`}
          />
        ) : null}
        <ToggleRow
          label="Green screen window"
          description="Chroma key compositing in any video switcher."
          checked={panelState.greenScreenEnabled}
          onChange={(value) => onPanelChange("greenScreenEnabled", value)}
        />
        {panelState.greenScreenEnabled ? (
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <input
              type="color"
              value={panelState.chromaKeyColor}
              onChange={(e) => onPanelChange("chromaKeyColor", e.target.value)}
              style={{ width: "40px", height: "32px", borderRadius: "var(--radius-md)", background: "none", cursor: "pointer" }}
            />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Chroma key color</span>
          </div>
        ) : null}
        <ToggleRow
          label="NDI Alpha stream"
          description="Network video for ProPresenter, vMix, OBS with the NDI plugin."
          checked={panelState.ndiEnabled}
          onChange={(value) => onPanelChange("ndiEnabled", value)}
        />
        <InfoBanner>Middleware mode is aimed at established branches already using EasyWorship, OBS, or ProPresenter.</InfoBanner>
      </SettingsCard>
    </div>
  );
}
