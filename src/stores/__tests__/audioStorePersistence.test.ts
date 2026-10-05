// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("audio settings persistence", () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
  });

  it("restores VAD sensitivity after the store reloads", async () => {
    const firstModule = await import("../audioStore");
    firstModule.useAudioStore.getState().setVadSensitivity(0.73);
    firstModule.useAudioStore.getState().setDevice({
      index: 3,
      name: "USB Mixer",
      channels: 4,
      defaultSampleRate: 48000,
    });
    firstModule.useAudioStore.getState().setChannel(3);
    expect(window.localStorage.getItem("sermonsync-audio-settings")).toContain('"vadSensitivity":0.73');

    vi.resetModules();
    const reloadedModule = await import("../audioStore");
    expect(reloadedModule.useAudioStore.getState().vadSensitivity).toBe(0.73);
    expect(reloadedModule.useAudioStore.getState().preferredDeviceName).toBe("USB Mixer");
    expect(reloadedModule.useAudioStore.getState().preferredChannel).toBe(3);
  });

  it("clamps an invalid persisted sensitivity to the supported range", async () => {
    window.localStorage.setItem("sermonsync-audio-settings", JSON.stringify({
      state: { vadSensitivity: 4 },
      version: 1,
    }));

    const { useAudioStore } = await import("../audioStore");
    expect(useAudioStore.getState().vadSensitivity).toBe(1);
  });
});
