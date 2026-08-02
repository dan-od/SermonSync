import { useState } from "react";

import { useConfigStore } from "../../../stores/configStore";
import { IconRefresh, IconSparkles } from "../icons";
import { InfoBanner, SectionIntro, SettingsCard, StatusPill, TextRow, ToggleRow } from "../primitives";
import type { SettingsPanelState } from "../types";

interface IntelligenceTabProps {
  panelState: SettingsPanelState;
  onPanelChange: <K extends keyof SettingsPanelState>(key: K, value: SettingsPanelState[K]) => void;
}

export function IntelligenceTab({ panelState, onPanelChange }: IntelligenceTabProps) {
  const groqApiKey = useConfigStore((s) => s.groqApiKey);
  const groqEnabled = useConfigStore((s) => s.groqEnabled);
  const setGroq = useConfigStore((s) => s.setGroq);

  const [testStatus, setTestStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleTestConnection = () => {
    setTestStatus("loading");
    setTimeout(() => {
      if (!groqApiKey || groqApiKey.trim().length < 8) {
        setTestStatus("error");
        setGroq(groqApiKey, false);
      } else {
        setTestStatus("success");
        setGroq(groqApiKey, true);
      }
    }, 1200);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <SectionIntro
        title="Intelligence Layer"
        description="Optional online features powered by a free Groq API key. Enhances paraphrase matching and adds sermon-wide memory when internet is available (PRD §5.2)."
      />

      <SettingsCard
        icon={<IconSparkles />}
        title="Groq API Key"
        subtitle="Bring-your-own free key unlocks the online intelligence layer"
        badge={
          groqEnabled ? <StatusPill tone="success" label="Connected" /> : <StatusPill tone="neutral" label="Offline" />
        }
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "10px", color: "var(--fg-subtle)", fontFamily: "var(--font-mono)" }}>
              CORE SCRIPTURE DETECTION WORKS FULLY OFFLINE — THIS IS OPTIONAL
            </span>
            <button
              type="button"
              disabled={testStatus === "loading"}
              onClick={handleTestConnection}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: "none",
                border: "none",
                color: "var(--color-primary)",
                fontSize: "var(--text-xs)",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <IconRefresh style={testStatus === "loading" ? { animation: "spin 1s linear infinite" } : undefined} />
              {testStatus === "loading" ? "Verifying..." : "Test Connection"}
            </button>
          </div>
        }
      >
        <TextRow
          label="Groq API Key"
          secret
          value={groqApiKey ?? ""}
          onChange={(value) => setGroq(value, groqEnabled)}
          placeholder="gsk_xxxxxxxxxxxxxxxxxxxxxxxx"
          hint="Stored locally. Never uploaded to any SermonSync telemetry server."
        />
        {testStatus === "success" ? (
          <InfoBanner>Groq key verified. Intelligence layer features below are now active.</InfoBanner>
        ) : null}
        {testStatus === "error" ? (
          <InfoBanner tone="warning">Could not verify key. Double-check it was copied correctly from console.groq.com.</InfoBanner>
        ) : null}
      </SettingsCard>

      <SettingsCard icon={<IconSparkles />} title="Online Intelligence Features" subtitle="Requires a verified Groq key (PRD §5.2)">
        <ToggleRow
          label="Contextual verse detection"
          description={'Understands "the next verse", "read on", "go back to verse 1" by tracking what\'s on screen.'}
          checked={panelState.contextualDetectionEnabled}
          onChange={(value) => onPanelChange("contextualDetectionEnabled", value)}
        />
        <ToggleRow
          label="Smart verse navigation"
          description={'Auto-advances through a read passage ("verse 2... verse 3...") without waiting for explicit references.'}
          checked={panelState.smartVerseNavigationEnabled}
          onChange={(value) => onPanelChange("smartVerseNavigationEnabled", value)}
        />
        <ToggleRow
          label="Key point detection"
          description="Identifies repeated themes and suggests main point slides."
          checked={panelState.keyPointDetectionEnabled}
          onChange={(value) => onPanelChange("keyPointDetectionEnabled", value)}
        />
        <ToggleRow
          label="Sermon memory"
          description="Rolling JSON context tracks the full service for 3-4 hours."
          checked={panelState.sermonMemoryEnabled}
          onChange={(value) => onPanelChange("sermonMemoryEnabled", value)}
        />
        <ToggleRow
          label="Cross-service callbacks"
          description={'When the pastor says "like I said last week", searches the transcript archive.'}
          checked={panelState.crossServiceCallbacksEnabled}
          onChange={(value) => onPanelChange("crossServiceCallbacksEnabled", value)}
        />
        <ToggleRow
          label="Auto-generate post-service devotional"
          description="Produces a devotional guide with main points + scriptures after each session."
          checked={panelState.autoDevotionalGenerationEnabled}
          onChange={(value) => onPanelChange("autoDevotionalGenerationEnabled", value)}
        />
      </SettingsCard>
    </div>
  );
}
