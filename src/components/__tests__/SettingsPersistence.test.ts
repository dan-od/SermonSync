// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS_PANEL_STATE, type SettingsPanelState } from "../Settings/types";
import { loadPanelState, normalizeSettingsPanelState, SETTINGS_STORAGE_KEY } from "../Settings/settingsPersistence";

describe("settings panel persistence", () => {
  beforeEach(() => window.localStorage.clear());

  it("restores every configurable panel field after reload", () => {
    const expected: SettingsPanelState = {
      use24HourClock: true,
      highContrastColors: true,
      disableSuggestionLabels: true,
      audioInputDeviceId: "USB Mixer",
      audioLevelDb: -9,
      sttMode: "whisper",
      worshipDetectorSensitivity: 72,
      autoSendConfidenceThreshold: 91,
      contextualDetectionEnabled: false,
      keyPointDetectionEnabled: false,
      sermonMemoryEnabled: false,
      crossServiceCallbacksEnabled: true,
      smartVerseNavigationEnabled: false,
      autoDevotionalGenerationEnabled: true,
      outputDisplayId: "display-projector",
      idleScreenMode: "color",
      idleScreenColor: "#123456",
      logo: { src: "data:image/png;base64,persisted", fit: "stretch" },
      webCanvasEnabled: true,
      webCanvasPort: 9090,
      greenScreenEnabled: true,
      chromaKeyColor: "#112233",
      ndiEnabled: true,
      slideGroups: ["Communion", "Offering"],
      manualSearchFallbackVersion: "ENGLISHNKJ",
      localArchiveDirectory: "/archive/services",
      enableLocalArchival: false,
      retentionDays: 360,
      devotionalExportFormat: "text",
      autoUpdateEnabled: false,
      updateChannel: "beta",
      lastUpdateCheck: "2026-10-05 00:00",
      activeProfile: "midweek-study",
      transitions: {
        scriptures: { effect: "slide-left", durationMs: 777, easing: "spring", crossfade: false, motionBlur: true },
        songs: { effect: "cut", durationMs: 0, easing: "linear", crossfade: false, motionBlur: false },
        layout: { effect: "zoom-in", durationMs: 450, easing: "ease-out", crossfade: true, motionBlur: true },
        logo: { effect: "fade", durationMs: 250, easing: "ease", crossfade: true, motionBlur: false },
        black: { effect: "cut", durationMs: 0, easing: "linear", crossfade: false, motionBlur: false },
        clear: { effect: "dissolve", durationMs: 310, easing: "ease-in-out", crossfade: true, motionBlur: false },
      },
    };

    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(expected));
    expect(loadPanelState()).toEqual(expected);
    expect(Object.keys(loadPanelState()).sort()).toEqual(Object.keys(DEFAULT_SETTINGS_PANEL_STATE).sort());
  });

  it("fills newly introduced nested transition fields without losing saved values", () => {
    const restored = normalizeSettingsPanelState({
      logo: { fit: "stretch" },
      transitions: { scriptures: { durationMs: 825 } },
    });

    expect(restored.logo).toEqual({ src: null, fit: "stretch" });
    expect(restored.transitions.scriptures.durationMs).toBe(825);
    expect(restored.transitions.scriptures.effect).toBe(DEFAULT_SETTINGS_PANEL_STATE.transitions.scriptures.effect);
    expect(restored.transitions.songs).toEqual(DEFAULT_SETTINGS_PANEL_STATE.transitions.songs);
  });
});
