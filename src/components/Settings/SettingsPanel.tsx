import { useEffect, useState, type ReactElement } from "react";

import {
  IconArchive,
  IconBook,
  IconGeneral,
  IconHelp,
  IconMic,
  IconMonitor,
  IconLayout,
  IconPalette,
  IconSparkles,
  IconTerminal,
  IconUserCircle,
  IconX,
} from "./icons";
import { ArchivalTab } from "./tabs/ArchivalTab";
import { AudioDetectionTab } from "./tabs/AudioDetectionTab";
import { BibleVersionsTab } from "./tabs/BibleVersionsTab";
import { DisplayMiddlewareTab } from "./tabs/DisplayMiddlewareTab";
import { GeneralTab } from "./tabs/GeneralTab";
import { HelpTab } from "./tabs/HelpTab";
import { IntelligenceTab } from "./tabs/IntelligenceTab";
import { LogsTab } from "./tabs/LogsTab";
import { PresentationTab } from "./tabs/PresentationTab";
import { ProfilesTab } from "./tabs/ProfilesTab";
import { ThemeTab } from "./tabs/ThemeTab";
import { DEFAULT_SETTINGS_PANEL_STATE, type SettingsPanelState } from "./types";
import type { UiTheme } from "../../types/state";

export type SettingsTabId =
  | "general"
  | "audio"
  | "intelligence"
  | "bible"
  | "display"
  | "presentation"
  | "theme"
  | "archive"
  | "logs"
  | "profiles"
  | "help";

const TABS: { id: SettingsTabId; label: string; icon: ReactElement }[] = [
  { id: "general", label: "General", icon: <IconGeneral /> },
  { id: "audio", label: "Audio & Detection", icon: <IconMic /> },
  { id: "intelligence", label: "Intelligence Layer", icon: <IconSparkles /> },
  { id: "bible", label: "Bible Versions", icon: <IconBook /> },
  { id: "display", label: "Display & Middleware", icon: <IconMonitor /> },
  { id: "presentation", label: "Presentation", icon: <IconLayout /> },
  { id: "theme", label: "Theme", icon: <IconPalette /> },
  { id: "archive", label: "Archival", icon: <IconArchive /> },
  { id: "logs", label: "Session Logs", icon: <IconTerminal /> },
  { id: "profiles", label: "Profiles & Backup", icon: <IconUserCircle /> },
  { id: "help", label: "Help & About", icon: <IconHelp /> },
];

export interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  uiTheme: UiTheme;
  onUiThemeChange: (theme: UiTheme) => void;
}

export function SettingsPanel({ open, onClose, uiTheme, onUiThemeChange }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>("general");
  const [panelState, setPanelState] = useState<SettingsPanelState>(DEFAULT_SETTINGS_PANEL_STATE);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handlePanelChange = <K extends keyof SettingsPanelState>(key: K, value: SettingsPanelState[K]) => {
    setPanelState((prev) => ({ ...prev, [key]: value }));
  };

  const handleImportSettings = (value: Partial<SettingsPanelState>) => {
    setPanelState((prev) => ({ ...prev, ...value }));
  };

  const handleResetSettings = () => {
    if (window.confirm("Reset all settings to their default values? This cannot be undone.")) {
      setPanelState(DEFAULT_SETTINGS_PANEL_STATE);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      className="ss-settings-shell"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(5, 5, 10, 0.7)",
        backdropFilter: "blur(2px)",
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <style>{`
        .ss-settings-shell button,
        .ss-settings-shell input,
        .ss-settings-shell select,
        .ss-settings-shell textarea {
          outline: none;
          -webkit-tap-highlight-color: transparent;
        }
        .ss-settings-shell button:focus,
        .ss-settings-shell button:focus-visible,
        .ss-settings-shell input:focus,
        .ss-settings-shell input:focus-visible,
        .ss-settings-shell select:focus,
        .ss-settings-shell select:focus-visible,
        .ss-settings-shell textarea:focus,
        .ss-settings-shell textarea:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px var(--color-primary-muted);
        }
        .ss-settings-shell input[type="range"]:focus,
        .ss-settings-shell input[type="range"]:focus-visible,
        .ss-settings-shell input[type="color"]:focus,
        .ss-settings-shell input[type="color"]:focus-visible {
          box-shadow: none;
        }
      `}</style>
      <div
        style={{
          width: "min(1100px, 92vw)",
          height: "min(720px, 88vh)",
          display: "flex",
          background: "var(--bg-base)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
        }}
      >
        {/* Sidebar */}
        <aside
          style={{
            width: "220px",
            flexShrink: 0,
            background: "var(--bg-surface)",
            display: "flex",
            flexDirection: "column",
            padding: "var(--space-4) var(--space-3)",
            gap: "var(--space-1)",
            overflowY: "auto",
          }}
        >
          <div style={{ padding: "0 var(--space-2) var(--space-3)" }}>
            <p style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--fg-base)" }}>
              SermonSync
            </p>
            <p style={{ margin: "2px 0 0", fontSize: "10px", color: "var(--fg-subtle)", letterSpacing: "0.06em" }}>SETTINGS</p>
          </div>
          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "9px 10px",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background: active ? "var(--color-primary-muted)" : "transparent",
                  color: active ? "var(--color-primary)" : "var(--fg-muted)",
                  fontSize: "var(--text-xs)",
                  fontWeight: active ? 700 : 500,
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "background-color 120ms ease, color 120ms ease",
                }}
              >
                <span style={{ display: "flex", flexShrink: 0 }}>{tab.icon}</span>
                {tab.label}
              </button>
            );
          })}
        </aside>

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <header
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              padding: "var(--space-3) var(--space-4)",
              background: "var(--bg-surface)",
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              title="Close settings"
              aria-label="Close settings"
              style={{
                display: "grid",
                placeItems: "center",
                width: "28px",
                height: "28px",
                borderRadius: "var(--radius-md)",
                border: "none",
                background: "var(--bg-elevated)",
                color: "var(--fg-muted)",
                cursor: "pointer",
              }}
            >
              <IconX />
            </button>
          </header>

          <main style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "var(--space-6)" }}>
            <div style={{ maxWidth: "760px", margin: "0 auto" }}>
              {activeTab === "general" && <GeneralTab panelState={panelState} onPanelChange={handlePanelChange} />}
              {activeTab === "audio" && <AudioDetectionTab panelState={panelState} onPanelChange={handlePanelChange} />}
              {activeTab === "intelligence" && <IntelligenceTab panelState={panelState} onPanelChange={handlePanelChange} />}
              {activeTab === "bible" && <BibleVersionsTab />}
              {activeTab === "display" && <DisplayMiddlewareTab panelState={panelState} onPanelChange={handlePanelChange} />}
              {activeTab === "presentation" && <PresentationTab panelState={panelState} onPanelChange={handlePanelChange} />}
              {activeTab === "theme" && <ThemeTab theme={uiTheme} onThemeChange={onUiThemeChange} />}
              {activeTab === "archive" && <ArchivalTab panelState={panelState} onPanelChange={handlePanelChange} />}
              {activeTab === "logs" && <LogsTab />}
              {activeTab === "profiles" && (
                <ProfilesTab
                  panelState={panelState}
                  onPanelChange={handlePanelChange}
                  onImportSettings={handleImportSettings}
                  onResetSettings={handleResetSettings}
                />
              )}
              {activeTab === "help" && <HelpTab />}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
