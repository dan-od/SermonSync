// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

describe("settings-backed stores", () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
  });

  it("restores church, Bible, theme, provider and camera settings", async () => {
    const firstConfig = await import("../configStore");
    firstConfig.useConfigStore.getState().setUnit("FSQ-TEST-01", "Test Branch");
    firstConfig.useConfigStore.getState().setBibleVersion("TESTBible");
    firstConfig.useConfigStore.getState().setBibleVersions([{ abbreviation: "TESTBIBLE", name: "Test Bible", available: true, verse_count: 12 }]);
    firstConfig.useConfigStore.getState().setTheme("light");
    firstConfig.useConfigStore.getState().setDefaultModelProvider("openai");

    const firstCamera = await import("../cameraStore");
    firstCamera.useCameraStore.getState().addNetworkCamera({
      id: "camera-1",
      name: "Sanctuary Phone",
      kind: "ip-webcam",
      url: "http://192.168.1.20:8080/video",
    });

    vi.resetModules();
    const reloadedConfig = await import("../configStore");
    const reloadedCamera = await import("../cameraStore");
    expect(reloadedConfig.useConfigStore.getState()).toMatchObject({
      unitId: "FSQ-TEST-01",
      unitName: "Test Branch",
      bibleVersion: "TESTBible",
      theme: "light",
      defaultModelProvider: "openai",
    });
    expect(reloadedConfig.useConfigStore.getState().bibleVersions).toEqual([
      { abbreviation: "TESTBIBLE", name: "Test Bible", available: true, verse_count: 12 },
    ]);
    expect(reloadedCamera.useCameraStore.getState().networkCameras).toEqual([
      { id: "camera-1", name: "Sanctuary Phone", kind: "ip-webcam", url: "http://192.168.1.20:8080/video" },
    ]);
  });
});
