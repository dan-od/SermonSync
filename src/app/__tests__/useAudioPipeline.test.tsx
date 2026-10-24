// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { startCapture, stopCapture, selectDevice } = vi.hoisted(() => ({ startCapture: vi.fn(), stopCapture: vi.fn(), selectDevice: vi.fn() }));
vi.mock("../../lib/sidecarClient", () => ({
  getAudioDevices: vi.fn(async () => ({ devices: [], selected_index: null })),
  getSidecarStatus: vi.fn(async () => ({})),
  selectAudioDevice: selectDevice,
  setVadSensitivity: vi.fn(async () => ({})),
  startAudioCapture: startCapture,
  stopAudioCapture: stopCapture,
}));
vi.mock("../../lib/sidecarWs", () => ({ startSidecarWsBridge: () => () => undefined }));

import { useAudioPipeline } from "../useAudioPipeline";
import { useAudioStore } from "../../stores/audioStore";
import type { BranchAccount } from "../../components/Auth/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const device = { index: 1, name: "Microphone", channels: 1, defaultSampleRate: 48000 };
const branch = {} as BranchAccount;
let selectCaptureDevice: ReturnType<typeof useAudioPipeline>;

function Probe({ status, input = device }: { status: string; input?: typeof device }) {
  const selectDeviceForCapture = useAudioPipeline(branch, input, status);
  useEffect(() => { selectCaptureDevice = selectDeviceForCapture; }, [selectDeviceForCapture]);
  return null;
}

describe("audio capture transitions", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    useAudioStore.getState().reset();
    startCapture.mockReset();
    stopCapture.mockReset().mockResolvedValue({ capturing: false });
    selectDevice.mockReset().mockResolvedValue({ selected: device });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("waits for a pending start before stopping after a session ends", async () => {
    let finishStart!: (value: { capturing: boolean }) => void;
    startCapture.mockImplementationOnce(() => new Promise((resolve) => { finishStart = resolve; }));

    await act(async () => root.render(<Probe status="active" />));
    expect(startCapture).toHaveBeenCalledTimes(1);

    await act(async () => root.render(<Probe status="ended" />));
    expect(stopCapture).not.toHaveBeenCalled();

    await act(async () => {
      finishStart({ capturing: true });
      await Promise.resolve();
    });
    expect(stopCapture).toHaveBeenCalledTimes(1);
    expect(useAudioStore.getState().isCapturing).toBe(false);
  });

  it("serializes a device selection with capture and restarts on the new device", async () => {
    const calls: string[] = [];
    startCapture.mockImplementation(async () => { calls.push("start"); return { capturing: true }; });
    stopCapture.mockImplementation(async () => { calls.push("stop"); return { capturing: false }; });
    selectDevice.mockImplementation(async () => { calls.push("select"); return { selected: { ...device, index: 2, name: "USB Mic" } }; });

    await act(async () => root.render(<Probe status="active" />));
    await act(async () => { await selectCaptureDevice({ index: 2, channels: 1 }); });
    await act(async () => root.render(<Probe status="active" input={{ ...device, index: 2, name: "USB Mic" }} />));

    expect(calls).toEqual(["start", "stop", "select", "start"]);
  });
});
