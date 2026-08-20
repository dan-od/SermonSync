import { beforeEach, describe, expect, it } from "vitest";

import { useAudioStore } from "../audioStore";

describe("audioStore", () => {
  beforeEach(() => {
    useAudioStore.getState().reset();
  });

  it("selects a device by name from inventory", () => {
    useAudioStore.getState().setAvailableDevices([
      { index: 1, name: "USB Mic", channels: 1, defaultSampleRate: 48000 },
    ]);

    useAudioStore.getState().setDeviceByName("USB Mic");
    const state = useAudioStore.getState();

    expect(state.inputDevice?.name).toBe("USB Mic");
    expect(state.sampleRate).toBe(48000);
    expect(state.status).toBe("connected");
  });

  it("updates metering and capture status from audio levels", () => {
    useAudioStore.getState().setAudioLevel(0.22, 0.61);
    const state = useAudioStore.getState();

    expect(state.levelRms).toBe(0.22);
    expect(state.levelPeak).toBe(0.61);
    expect(state.isCapturing).toBe(true);
    expect(state.status).toBe("capturing");
  });
});
