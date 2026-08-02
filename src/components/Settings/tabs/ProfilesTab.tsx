import { useRef, useState, type ChangeEvent, type ReactNode } from "react";

import { IconDownload, IconRefresh, IconUpload, IconUserCircle } from "../icons";
import { InfoBanner, SettingsCard } from "../primitives";
import { SESSION_PROFILE_PRESETS, type SessionProfileId, type SettingsPanelState } from "../types";

interface ProfilesTabProps {
  panelState: SettingsPanelState;
  onPanelChange: <K extends keyof SettingsPanelState>(key: K, value: SettingsPanelState[K]) => void;
  onImportSettings: (value: Partial<SettingsPanelState>) => void;
  onResetSettings: () => void;
}

export function ProfilesTab({ panelState, onPanelChange, onImportSettings, onResetSettings }: ProfilesTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: "success" | "warning"; text: string } | null>(null);

  const flash = (tone: "success" | "warning", text: string) => {
    setMessage({ tone, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleSwitchProfile = (profile: SessionProfileId) => {
    onPanelChange("activeProfile", profile);
    flash("success", `Switched to "${SESSION_PROFILE_PRESETS.find((p) => p.id === profile)?.name}". Values apply immediately.`);
  };

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(panelState, null, 2));
    const anchor = document.createElement("a");
    anchor.setAttribute("href", dataStr);
    anchor.setAttribute("download", `sermonsync_settings_${panelState.activeProfile}.json`);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    flash("success", "Settings exported as JSON.");
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleImportFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(String(event.target?.result));
        onImportSettings(parsed);
        flash("success", "Settings imported. Review each tab before relying on them live.");
      } catch {
        flash("warning", "Invalid JSON file — import failed.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <div>
        <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-xl)", fontWeight: 700, color: "var(--fg-base)", margin: 0 }}>
          Session Profiles & Backup
        </h2>
        <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: "6px", lineHeight: 1.5 }}>
          Switch between preset detection/output configurations for different service types, or back up your settings.
        </p>
      </div>

      {message ? <InfoBanner tone={message.tone === "warning" ? "warning" : "info"}>{message.text}</InfoBanner> : null}

      <SettingsCard icon={<IconUserCircle />} title="Service Profile Presets">
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {SESSION_PROFILE_PRESETS.map((preset) => {
            const active = preset.id === panelState.activeProfile;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSwitchProfile(preset.id)}
                style={{
                  textAlign: "left",
                  padding: "12px",
                  borderRadius: "var(--radius-md)",
                  border: active ? "1px solid var(--color-primary)" : "1px solid transparent",
                  background: active ? "var(--color-primary-muted)" : "var(--bg-base)",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: active ? "var(--color-primary)" : "var(--fg-base)" }}>
                    {preset.name}
                  </span>
                  <span
                    style={{
                      fontSize: "9px",
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "var(--radius-full)",
                      background: active ? "var(--color-primary)" : "var(--bg-elevated)",
                      color: active ? "#fff" : "var(--fg-subtle)",
                    }}
                  >
                    {active ? "ACTIVE" : "APPLY"}
                  </span>
                </div>
                <p style={{ margin: "4px 0 0", fontSize: "10px", color: "var(--fg-subtle)", lineHeight: 1.4 }}>{preset.description}</p>
              </button>
            );
          })}
        </div>
      </SettingsCard>

      <SettingsCard icon={<IconRefresh />} title="Backup & Reset">
        <ActionRow icon={<IconDownload />} title="Export Settings" description="Save the current configuration as a JSON file." onClick={handleExport} />
        <ActionRow icon={<IconUpload />} title="Import Settings" description="Load a previously exported JSON configuration file." onClick={handleImportClick} />
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportFile} style={{ display: "none" }} />
        <ActionRow icon={<IconRefresh />} title="Factory Reset" description="Erase custom values and return every setting to its default." onClick={onResetSettings} danger />
      </SettingsCard>
    </div>
  );
}

function ActionRow({
  icon,
  title,
  description,
  onClick,
  danger,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-3)",
        padding: "12px",
        borderRadius: "var(--radius-md)",
        border: danger ? "1px solid var(--color-error)" : "1px solid transparent",
        background: "var(--bg-base)",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
      }}
    >
      <div>
        <p style={{ margin: 0, fontSize: "var(--text-xs)", fontWeight: 700, color: danger ? "var(--color-error)" : "var(--fg-base)" }}>{title}</p>
        <p style={{ margin: "2px 0 0", fontSize: "10px", color: "var(--fg-subtle)" }}>{description}</p>
      </div>
      <span style={{ color: danger ? "var(--color-error)" : "var(--fg-subtle)", flexShrink: 0 }}>{icon}</span>
    </button>
  );
}
