/**
 * SermonSync Settings panel — mock/local state model.
 *
 * Fields already backed by real app state (Church ID/unit, default Bible
 * version, Groq key, UI theme) are read/written through `useConfigStore`
 * directly from the tabs that need them — see GeneralTab, IntelligenceTab,
 * BibleVersionsTab, ThemeTab.
 *
 * Everything below is scaffolding for PRD areas that don't have a real
 * backend/store wired up yet (audio capture, display/middleware output,
 * archival, session profiles, logs). These are intentionally mock so the UI
 * shape exists ahead of the Rust/Python implementation — see SermonSync PRD
 * v3.0 §5–§10.
 */

export type SttMode = "moonshine" | "whisper";
export type IdleScreenMode = "logo" | "background" | "color";
export type UpdateChannel = "stable" | "beta";
export type DevotionalExportFormat = "pdf" | "text";
export type SessionProfileId = "default" | "sunday-service" | "midweek-study" | "youth-special";

export interface SettingsPanelState {
  // General & accessibility (PRD §4.1, §8.1)
  use24HourClock: boolean;
  highContrastColors: boolean;
  disableSuggestionLabels: boolean;

  // Audio input (PRD §5.5)
  audioInputDeviceId: string;
  audioLevelDb: number;

  // AI scripture detection — offline (PRD §5.1)
  sttMode: SttMode;
  worshipDetectorSensitivity: number;
  autoSendConfidenceThreshold: number;

  // Online intelligence layer (PRD §5.2) — feature toggles only; the Groq
  // key + enabled flag live in useConfigStore (groqApiKey / groqEnabled).
  contextualDetectionEnabled: boolean;
  keyPointDetectionEnabled: boolean;
  sermonMemoryEnabled: boolean;
  crossServiceCallbacksEnabled: boolean;
  smartVerseNavigationEnabled: boolean;
  autoDevotionalGenerationEnabled: boolean;

  // Display takeover & idle screen (PRD §5.3)
  outputDisplayId: string;
  idleScreenMode: IdleScreenMode;
  idleScreenColor: string;
  defaultProjectorFontSizePx: number;

  // Middleware mode (PRD §5.4)
  webCanvasEnabled: boolean;
  webCanvasPort: number;
  greenScreenEnabled: boolean;
  chromaKeyColor: string;
  ndiEnabled: boolean;

  // Basic presentation (PRD §5.3)
  slideGroups: string[];
  manualSearchFallbackVersion: string;

  // Archival & session data (PRD §5.2 sermon memory, §8.3 post-service)
  localArchiveDirectory: string;
  enableLocalArchival: boolean;
  retentionDays: number;
  devotionalExportFormat: DevotionalExportFormat;

  // Distribution & auth (PRD §9)
  autoUpdateEnabled: boolean;
  updateChannel: UpdateChannel;
  lastUpdateCheck: string;

  // Session profiles (mock preset switcher)
  activeProfile: SessionProfileId;
}

export const DEFAULT_SETTINGS_PANEL_STATE: SettingsPanelState = {
  use24HourClock: false,
  highContrastColors: false,
  disableSuggestionLabels: false,

  audioInputDeviceId: "builtin-mic",
  audioLevelDb: -18,

  sttMode: "moonshine",
  worshipDetectorSensitivity: 65,
  autoSendConfidenceThreshold: 80,

  contextualDetectionEnabled: true,
  keyPointDetectionEnabled: true,
  sermonMemoryEnabled: true,
  crossServiceCallbacksEnabled: false,
  smartVerseNavigationEnabled: true,
  autoDevotionalGenerationEnabled: false,

  outputDisplayId: "display-1",
  idleScreenMode: "logo",
  idleScreenColor: "#0a0a0f",
  defaultProjectorFontSizePx: 48,

  webCanvasEnabled: false,
  webCanvasPort: 8080,
  greenScreenEnabled: false,
  chromaKeyColor: "#00ff00",
  ndiEnabled: false,

  slideGroups: ["Welcome", "Announcement", "Offering Time", "Altar Call"],
  manualSearchFallbackVersion: "KJV",

  localArchiveDirectory: "C:/SermonSync/Archives",
  enableLocalArchival: true,
  retentionDays: 180,
  devotionalExportFormat: "pdf",

  autoUpdateEnabled: true,
  updateChannel: "stable",
  lastUpdateCheck: "2026-07-26 09:12",

  activeProfile: "default",
};

export interface AudioInputOption {
  id: string;
  label: string;
}

export const MOCK_AUDIO_INPUTS: AudioInputOption[] = [
  { id: "builtin-mic", label: "Built-in Laptop Microphone" },
  { id: "usb-capture-card", label: "USB Capture Card" },
  { id: "usb-audio-interface", label: "USB Audio Interface" },
  { id: "mixer-line-in", label: "Line-in — Mixing Board" },
  { id: "virtual-cable", label: "Virtual Audio Cable" },
];

export interface DisplayOption {
  id: string;
  label: string;
  resolution: string;
}

export const MOCK_DISPLAYS: DisplayOption[] = [
  { id: "display-1", label: "Display 1 — Main Projector", resolution: "1920×1080 @ 60Hz" },
  { id: "display-2", label: "Display 2 — Foyer TV", resolution: "1920×1080 @ 60Hz" },
  { id: "display-3", label: "Display 3 — Stage Monitor", resolution: "Offline / Standby" },
];

export interface SessionLogEntry {
  id: string;
  timestamp: string;
  type: "info" | "success" | "warning" | "error";
  category: "detection" | "audio" | "ai" | "display" | "system";
  message: string;
}

export const MOCK_SESSION_LOGS: SessionLogEntry[] = [
  {
    id: "1",
    timestamp: "2026-07-29 09:41:02",
    type: "success",
    category: "detection",
    message: 'Explicit reference matched via trie: "John 3:16" (confidence 0.98, stage 1).',
  },
  {
    id: "2",
    timestamp: "2026-07-29 09:40:55",
    type: "info",
    category: "audio",
    message: "Worship/speech detector switched to SPEECH mode after 4.2s of silence.",
  },
  {
    id: "3",
    timestamp: "2026-07-29 09:38:10",
    type: "info",
    category: "audio",
    message: "Energy-based detector identified sustained music energy — transcription paused.",
  },
  {
    id: "4",
    timestamp: "2026-07-29 09:31:47",
    type: "success",
    category: "ai",
    message: 'Groq contextual resolver matched "the next verse" → Romans 8:29.',
  },
  {
    id: "5",
    timestamp: "2026-07-29 09:15:03",
    type: "warning",
    category: "ai",
    message: "Groq API latency exceeded 2.5s — falling back to algorithmic matcher only.",
  },
  {
    id: "6",
    timestamp: "2026-07-29 09:00:00",
    type: "success",
    category: "system",
    message: "Session started. Church ID FSQ-PH-MGBUOGBA-01 authenticated. Bible DB loaded (KJV, 31,102 verses).",
  },
];

export interface SessionProfilePreset {
  id: SessionProfileId;
  name: string;
  description: string;
}

export const SESSION_PROFILE_PRESETS: SessionProfilePreset[] = [
  {
    id: "default",
    name: "Default",
    description: "Balanced detection sensitivity for general use.",
  },
  {
    id: "sunday-service",
    name: "Sunday Morning Service",
    description: "Higher confidence threshold, sermon memory + devotional generation enabled.",
  },
  {
    id: "midweek-study",
    name: "Midweek Bible Study",
    description: "Lower auto-send threshold for faster manual confirmation during discussion.",
  },
  {
    id: "youth-special",
    name: "Youth / Special Event",
    description: "Worship detector tuned for band-heavy music, NDI + green screen enabled.",
  },
];
