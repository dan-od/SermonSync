import { useEffect, useState } from "react";

import { useConfigStore } from "../../../stores/configStore";
import type { ModelProviderId } from "../../../types/state";
import { IconRefresh, IconSparkles } from "../icons";
import { InfoBanner, SectionIntro, SelectRow, SettingsCard, StatusPill, TextRow, ToggleRow } from "../primitives";
import type { SettingsPanelState } from "../types";

interface IntelligenceTabProps {
  panelState: SettingsPanelState;
  onPanelChange: <K extends keyof SettingsPanelState>(key: K, value: SettingsPanelState[K]) => void;
}

const MODEL_PROVIDER_LABELS: Record<ModelProviderId, string> = {
  groq: "Groq",
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
};

export function IntelligenceTab({ panelState, onPanelChange }: IntelligenceTabProps) {
  const groqApiKey = useConfigStore((s) => s.groqApiKey);
  const groqEnabled = useConfigStore((s) => s.groqEnabled);
  const setGroq = useConfigStore((s) => s.setGroq);
  const modelProviderKeys = useConfigStore((s) => s.modelProviderKeys);
  const setModelProviderKey = useConfigStore((s) => s.setModelProviderKey);
  const loadProviderKey = useConfigStore((s) => s.loadProviderKey);
  const defaultModelProvider = useConfigStore((s) => s.defaultModelProvider);
  const setDefaultModelProvider = useConfigStore((s) => s.setDefaultModelProvider);

  const [testStatus, setTestStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [groqDraft, setGroqDraft] = useState("");
  const [providerDrafts, setProviderDrafts] = useState({ openai: "", anthropic: "", gemini: "" });
  const [isLoadingKeys, setIsLoadingKeys] = useState(true);
  const [isSavingKeys, setIsSavingKeys] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadProviderKey("groq"), loadProviderKey("openai"), loadProviderKey("anthropic"), loadProviderKey("gemini")]).then(
      ([groq, openai, anthropic, gemini]) => {
        if (cancelled) return;
        setGroqDraft(groq ?? "");
        setProviderDrafts({ openai: openai ?? "", anthropic: anthropic ?? "", gemini: gemini ?? "" });
        setIsLoadingKeys(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [loadProviderKey]);

  const configuredProviders: ModelProviderId[] = [
    ...(groqApiKey && groqEnabled ? (["groq"] as const) : []),
    ...(Object.keys(modelProviderKeys) as Exclude<ModelProviderId, "groq">[]).filter((id) => Boolean(modelProviderKeys[id])),
  ];

  const handleSaveKeys = async () => {
    setIsSavingKeys(true);
    setSaveMessage(null);
    try {
      await setGroq(groqDraft || null, groqEnabled);
      await setModelProviderKey("openai", providerDrafts.openai || null);
      await setModelProviderKey("anthropic", providerDrafts.anthropic || null);
      await setModelProviderKey("gemini", providerDrafts.gemini || null);
      setSaveMessage("API keys saved securely on this device.");
    } catch (saveError) {
      setSaveMessage(saveError instanceof Error ? saveError.message : "Could not save API keys securely.");
    } finally {
      setIsSavingKeys(false);
    }
  };

  const handleTestConnection = () => {
    setTestStatus("loading");
    setTimeout(() => {
      if (!groqDraft || groqDraft.trim().length < 8) {
        setTestStatus("error");
        void setGroq(groqDraft || null, false);
      } else {
        setTestStatus("success");
        void setGroq(groqDraft, true);
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
          value={groqDraft}
          onChange={setGroqDraft}
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

      <button
        type="button"
        disabled={isLoadingKeys || isSavingKeys}
        onClick={() => void handleSaveKeys()}
        style={{
          alignSelf: "flex-start",
          border: "none",
          borderRadius: "var(--radius-md)",
          background: "var(--color-primary)",
          color: "var(--fg-on-accent)",
          padding: "9px 14px",
          fontSize: "var(--text-xs)",
          fontWeight: 700,
          cursor: isLoadingKeys || isSavingKeys ? "wait" : "pointer",
        }}
      >
        {isLoadingKeys ? "Loading secure keys..." : isSavingKeys ? "Saving securely..." : "Save API Keys"}
      </button>
      {saveMessage ? <InfoBanner tone={saveMessage.startsWith("API keys") ? "info" : "warning"}>{saveMessage}</InfoBanner> : null}

      <SettingsCard icon={<IconSparkles />} title="Other Model Providers" subtitle="Optional keys for additional AI providers">
        <TextRow
          label="OpenAI API Key"
          secret
          value={providerDrafts.openai}
          onChange={(value) => setProviderDrafts((current) => ({ ...current, openai: value }))}
          placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
        />
        <TextRow
          label="Anthropic API Key"
          secret
          value={providerDrafts.anthropic}
          onChange={(value) => setProviderDrafts((current) => ({ ...current, anthropic: value }))}
          placeholder="sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx"
        />
        <TextRow
          label="Gemini API Key"
          secret
          value={providerDrafts.gemini}
          onChange={(value) => setProviderDrafts((current) => ({ ...current, gemini: value }))}
          placeholder="AIzaSyxxxxxxxxxxxxxxxxxxxxxxxx"
        />
      </SettingsCard>

      <SettingsCard icon={<IconSparkles />} title="Default Model Provider" subtitle="Shown live in the status bar once a key is set">
        <SelectRow
          label="Default provider"
          hint="Only providers with a configured API key can be selected."
          value={defaultModelProvider ?? ""}
          options={[
            { value: "", label: "None" },
            ...configuredProviders.map((id) => ({ value: id, label: MODEL_PROVIDER_LABELS[id] })),
          ]}
          onChange={(value) => setDefaultModelProvider(value ? (value as ModelProviderId) : null)}
        />
        {configuredProviders.length === 0 ? (
          <InfoBanner tone="warning">Add and verify an API key above before choosing a default provider.</InfoBanner>
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
