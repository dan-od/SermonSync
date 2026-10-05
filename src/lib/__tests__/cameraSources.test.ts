import { afterEach, describe, expect, it, vi } from "vitest";

import { listLocalCameras } from "../cameraSources";

const originalMediaDevices = navigator.mediaDevices;

afterEach(() => {
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: originalMediaDevices });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("local camera discovery", () => {
  it("shows a Linux capture and metadata pair only once", async () => {
    const devices = [
      { kind: "videoinput", deviceId: "usb-capture", label: "USB3 Video (V4L2)", groupId: "usb-a" },
      { kind: "videoinput", deviceId: "usb-metadata", label: "USB3 Video (V4L2)", groupId: "usb-b" },
      { kind: "videoinput", deviceId: "integrated-capture", label: "Integrated Webcam_HD (V4L2)", groupId: "builtin-a" },
      { kind: "videoinput", deviceId: "integrated-metadata", label: "Integrated Webcam_HD (V4L2)", groupId: "builtin-b" },
    ];
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { enumerateDevices: vi.fn().mockResolvedValue(devices) },
    });

    expect(await listLocalCameras()).toEqual([
      { deviceId: "usb-capture", label: "USB3 Video (V4L2)" },
      { deviceId: "integrated-capture", label: "Integrated Webcam_HD (V4L2)" },
    ]);
  });

  it("uses the native device list on Linux WebKit without requesting browser capture", async () => {
    const getUserMedia = vi.fn();
    const enumerateDevices = vi.fn();
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15", mediaDevices: { getUserMedia, enumerateDevices } });
    const fetchDevices = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ devices: [{ deviceId: "/dev/video3", label: "Integrated Webcam_HD" }] }) });
    vi.stubGlobal("fetch", fetchDevices);

    expect(await listLocalCameras()).toEqual([{ deviceId: "/dev/video3", label: "Integrated Webcam_HD" }]);
    expect(fetchDevices).toHaveBeenCalledWith(expect.stringContaining("/api/camera/devices"));
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(enumerateDevices).not.toHaveBeenCalled();
  });
});
