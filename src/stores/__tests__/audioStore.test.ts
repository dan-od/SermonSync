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

  it("keeps the selected input on refresh and clears it if its index is reused", () => {
    const microphone = { index: 1, name: "USB Mic", channels: 1, defaultSampleRate: 48000 };
    useAudioStore.getState().setAvailableDevices([microphone]);
    useAudioStore.getState().setDeviceByName(microphone.name);

    useAudioStore.getState().setAvailableDevices([
      { ...microphone },
      { index: 2, name: "New Mixer", channels: 2, defaultSampleRate: 44100 },
    ]);
    expect(useAudioStore.getState().inputDevice).toEqual(microphone);

    useAudioStore.getState().setAvailableDevices([
      { index: 1, name: "Different Mic", channels: 1, defaultSampleRate: 48000 },
    ]);
    const state = useAudioStore.getState();
    expect(state.inputDevice).toBeNull();
    expect(state.status).toBe("disconnected");
    expect(state.preferredDeviceName).toBe("USB Mic");
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
