import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAudioDevices } = vi.hoisted(() => ({ getAudioDevices: vi.fn() }));
vi.mock("../../lib/sidecarClient", () => ({ getAudioDevices }));

import { createAudioDeviceHandlers } from "../useAudioDeviceHandlers";
import { useAudioStore } from "../../stores/audioStore";

const microphone = { index: 1, name: "USB Mic", channels: 1, defaultSampleRate: 48000 };
const newMixer = { index: 2, name: "New Mixer", channels: 2, defaultSampleRate: 44100 };

function scanHandler() {
  const state = useAudioStore.getState();
  return createAudioDeviceHandlers({
    inputDevice: state.inputDevice,
    setAudioDevice: state.setDevice,
    setAudioChannel: state.setChannel,
    selectCaptureDevice: vi.fn(),
  }).handleAudioDeviceScan;
}

describe("manual audio device scan", () => {
  beforeEach(() => {
    useAudioStore.getState().reset();
    getAudioDevices.mockReset();
  });

  it("forces a fresh scan and keeps the selected microphone when another is plugged in", async () => {
    useAudioStore.getState().setAvailableDevices([microphone]);
    useAudioStore.getState().setDeviceByName(microphone.name);
    getAudioDevices.mockResolvedValue({ devices: [microphone, newMixer] });

    await scanHandler()();

    expect(getAudioDevices).toHaveBeenCalledWith(true);
    expect(useAudioStore.getState().availableDevices).toEqual([microphone, newMixer]);
    expect(useAudioStore.getState().inputDevice).toEqual(microphone);
  });

  it("does not restart PortAudio while capture is active", async () => {
    useAudioStore.getState().setCapturing(true);

    await expect(scanHandler()()).rejects.toThrow("Pause or end the session");
    expect(getAudioDevices).not.toHaveBeenCalled();
  });
});
