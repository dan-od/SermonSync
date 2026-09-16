import { useEffect, useState, type ReactElement } from "react";

import {
  IconArchive,
  IconBook,
  IconGeneral,
  IconHelp,
  IconKeyboard,
  IconLayout,
  IconMic,
  IconMonitor,
  IconPalette,
  IconSparkles,
  IconTerminal,
  IconTransition,
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
import { ShortcutsTab } from "./tabs/ShortcutsTab";
import { ThemeTab } from "./tabs/ThemeTab";
import { TransitionsTab } from "./tabs/TransitionsTab";
import { DEFAULT_SETTINGS_PANEL_STATE, type SettingsPanelState } from "./types";
import type { AudioInputDevice, AudioStatus, UiTheme } from "../../types/state";
import { useProjectorStore } from "../../stores/projectorStore";

export type SettingsTabId =
  | "general"
  | "audio"
  | "intelligence"
  | "bible"
  | "display"
  | "presentation"
  | "shortcuts"
  | "transitions"
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
  { id: "shortcuts", label: "Keyboard Shortcuts", icon: <IconKeyboard /> },
  { id: "transitions", label: "Transitions & Motion", icon: <IconTransition /> },
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
  audioDevices: AudioInputDevice[];
  selectedDevice: AudioInputDevice | null;
  inputChannel: number;
  audioStatus: AudioStatus;
  audioError: string | null;
  levelRms: number;
  levelPeak: number;
  vadSensitivity: number;
  onAudioDeviceChange: (name: string) => void;
  onAudioChannelChange: (channel: number) => void;
  onVadSensitivityChange: (value: number) => void;
}

const SETTINGS_STORAGE_KEY = "sermonsync-settings-panel";

function loadPanelState(): SettingsPanelState {
  if (typeof window === "undefined") return DEFAULT_SETTINGS_PANEL_STATE;

  try {
    const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) return DEFAULT_SETTINGS_PANEL_STATE;
    return { ...DEFAULT_SETTINGS_PANEL_STATE, ...JSON.parse(stored) as Partial<SettingsPanelState> };
  } catch {
    return DEFAULT_SETTINGS_PANEL_STATE;
  }
}

export function SettingsPanel({
  open,
  onClose,
  uiTheme,
  onUiThemeChange,
  audioDevices,
  selectedDevice,
  inputChannel,
  audioStatus,
  audioError,
  levelRms,
  levelPeak,
  vadSensitivity,
  onAudioDeviceChange,
  onAudioChannelChange,
  onVadSensitivityChange,
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>("general");
  const [visitedTabs, setVisitedTabs] = useState<Set<SettingsTabId>>(() => new Set(["general"]));
  const [panelState, setPanelState] = useState<SettingsPanelState>(loadPanelState);

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(panelState));
    useProjectorStore.getState().setTransitions(panelState.transitions);
  }, [panelState]);

  useEffect(() => {
    if (!open) return;
    const preload = () => {
      setVisitedTabs(new Set(TABS.map((tab) => tab.id)));
    };
    const idleHandle = typeof window.requestIdleCallback === "function"
      ? window.requestIdleCallback(preload)
      : window.setTimeout(preload, 100);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if ("cancelIdleCallback" in window && typeof idleHandle === "number") {
        window.cancelIdleCallback(idleHandle);
      } else {
        window.clearTimeout(idleHandle);
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  const handlePanelChange = <K extends keyof SettingsPanelState>(key: K, value: SettingsPanelState[K]) => {
    setPanelState((prev) => ({ ...prev, [key]: value }));
    if (key === "transitions") {
      useProjectorStore.getState().setTransitions(value as SettingsPanelState["transitions"]);
    }
  };

  const handleImportSettings = (value: Partial<SettingsPanelState>) => {
    setPanelState((prev) => {
      const next = { ...prev, ...value };
      if (next.transitions) {
        useProjectorStore.getState().setTransitions(next.transitions);
      }
      return next;
    });
  };

  const handleResetSettings = () => {
    if (window.confirm("Reset all settings to their default values? This cannot be undone.")) {
      setPanelState(DEFAULT_SETTINGS_PANEL_STATE);
      useProjectorStore.getState().setTransitions(DEFAULT_SETTINGS_PANEL_STATE.transitions);
    }
  };

  const handleTabChange = (tabId: SettingsTabId) => {
    setActiveTab(tabId);
    setVisitedTabs((previous) => {
      if (previous.has(tabId)) return previous;
      return new Set(previous).add(tabId);
    });
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
        background: "var(--overlay-backdrop)",
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
                onClick={() => handleTabChange(tab.id)}
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
              {visitedTabs.has("general") ? <div style={{ display: activeTab === "general" ? "block" : "none" }}><GeneralTab panelState={panelState} onPanelChange={handlePanelChange} /></div> : null}
              {visitedTabs.has("audio") ? <div style={{ display: activeTab === "audio" ? "block" : "none" }}><AudioDetectionTab
                panelState={panelState}
                onPanelChange={handlePanelChange}
                audioDevices={audioDevices}
                selectedDevice={selectedDevice}
                inputChannel={inputChannel}
                audioStatus={audioStatus}
                audioError={audioError}
                levelRms={levelRms}
                levelPeak={levelPeak}
                vadSensitivity={vadSensitivity}
                onAudioDeviceChange={onAudioDeviceChange}
                onAudioChannelChange={onAudioChannelChange}
                onVadSensitivityChange={onVadSensitivityChange}
              /></div> : null}
              {visitedTabs.has("intelligence") ? <div style={{ display: activeTab === "intelligence" ? "block" : "none" }}><IntelligenceTab panelState={panelState} onPanelChange={handlePanelChange} /></div> : null}
              {visitedTabs.has("bible") ? <div style={{ display: activeTab === "bible" ? "block" : "none" }}><BibleVersionsTab /></div> : null}
              {visitedTabs.has("display") ? <div style={{ display: activeTab === "display" ? "block" : "none" }}><DisplayMiddlewareTab panelState={panelState} onPanelChange={handlePanelChange} /></div> : null}
              {visitedTabs.has("presentation") ? <div style={{ display: activeTab === "presentation" ? "block" : "none" }}><PresentationTab panelState={panelState} onPanelChange={handlePanelChange} /></div> : null}
              {visitedTabs.has("shortcuts") ? <div style={{ display: activeTab === "shortcuts" ? "block" : "none" }}><ShortcutsTab /></div> : null}
              {visitedTabs.has("transitions") ? <div style={{ display: activeTab === "transitions" ? "block" : "none" }}><TransitionsTab panelState={panelState} onPanelChange={handlePanelChange} /></div> : null}
              {visitedTabs.has("theme") ? <div style={{ display: activeTab === "theme" ? "block" : "none" }}><ThemeTab theme={uiTheme} onThemeChange={onUiThemeChange} /></div> : null}
              {visitedTabs.has("archive") ? <div style={{ display: activeTab === "archive" ? "block" : "none" }}><ArchivalTab panelState={panelState} onPanelChange={handlePanelChange} /></div> : null}
              {visitedTabs.has("logs") ? <div style={{ display: activeTab === "logs" ? "block" : "none" }}><LogsTab /></div> : null}
              {visitedTabs.has("profiles") ? <div style={{ display: activeTab === "profiles" ? "block" : "none" }}><ProfilesTab
                panelState={panelState}
                onPanelChange={handlePanelChange}
                onImportSettings={handleImportSettings}
                onResetSettings={handleResetSettings}
              /></div> : null}
              {visitedTabs.has("help") ? <div style={{ display: activeTab === "help" ? "block" : "none" }}><HelpTab /></div> : null}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
