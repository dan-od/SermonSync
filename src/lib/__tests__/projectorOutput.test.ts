import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` factories are hoisted above imports/consts, so the mocks they
// reference must be created via `vi.hoisted` to avoid a TDZ error.
const { invokeMock, postMessageMock, subscribeChannelMock, channelListenerRef, availableMonitorsMock, primaryMonitorMock, MockWebviewWindow } = vi.hoisted(() => {
  const invokeMock = vi.fn(async (command: string): Promise<unknown> => {
    if (command === "list_display_info") return [];
    if (command === "place_projector_window") return true;
    return undefined;
  });
  const postMessageMock = vi.fn();
  const channelListenerRef: { current?: (message: { type: string; revision?: number }) => void } = {};
  const subscribeChannelMock = vi.fn((listener: (message: { type: string; revision?: number }) => void) => {
    channelListenerRef.current = listener;
    return vi.fn();
  });
  const availableMonitorsMock = vi.fn(async () => [] as unknown[]);
  const primaryMonitorMock = vi.fn(async () => null as unknown);

  class MockWebviewWindow {
    static instances: MockWebviewWindow[] = [];
    static getByLabel = vi.fn(async (label: string) => (
      MockWebviewWindow.instances.find((instance) => instance.label === label) ?? null
    ));

    label: string;
    options: Record<string, unknown>;
    once = vi.fn((event: string, callback: (payload?: unknown) => void) => {
      if (event === "tauri://created") queueMicrotask(() => callback());
      return Promise.resolve(() => undefined);
    });
    show = vi.fn(async () => undefined);
    hide = vi.fn(async () => undefined);
    close = vi.fn(async () => undefined);

    constructor(label: string, options: Record<string, unknown>) {
      this.label = label;
      this.options = options;
      MockWebviewWindow.instances.push(this);
    }
  }

  return { invokeMock, postMessageMock, subscribeChannelMock, channelListenerRef, availableMonitorsMock, primaryMonitorMock, MockWebviewWindow };
});

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("../projectorChannel", () => ({
  postProjectorChannelMessage: postMessageMock,
  subscribeProjectorChannel: subscribeChannelMock,
}));
vi.mock("@tauri-apps/api/window", () => ({
  availableMonitors: availableMonitorsMock,
  primaryMonitor: primaryMonitorMock,
}));
vi.mock("@tauri-apps/api/webviewWindow", () => ({ WebviewWindow: MockWebviewWindow }));

import { useProjectorStore } from "../../stores/projectorStore";
import {
  closeProjectorOutput,
  discoverDisplays,
  hideProjectorOutput,
  isProjectorOutputWindow,
  openProjectorOutput,
  publishProjectorSnapshot,
  PROJECTOR_OUTPUT_LABEL,
  selectedDisplay,
  snapshotProjectorState,
  startProjectorOutputBridge,
} from "../projectorOutput";

const primary = {
  name: "DISPLAY1",
  position: { x: 0, y: 0 },
  size: { width: 1920, height: 1080 },
  scaleFactor: 1,
};

const secondary = {
  name: "DISPLAY2",
  position: { x: 1920, y: 0 },
  size: { width: 1920, height: 1080 },
  scaleFactor: 1,
};

const nativePrimary = {
  nativeId: 1,
  name: "DISPLAY1",
  friendlyName: "Built-in Display",
  x: 0,
  y: 0,
  width: 1920,
  height: 1080,
  logicalX: 0,
  logicalY: 0,
  logicalWidth: 1920,
  logicalHeight: 1080,
  scaleFactor: 1,
  refreshHz: 60,
  isPrimary: true,
};

const nativeSecondary = {
  ...nativePrimary,
  nativeId: 2,
  name: "DISPLAY2",
  friendlyName: "HDMI Projector",
  x: 1920,
  refreshHz: 75,
  isPrimary: false,
};

describe("projectorOutput display manager", () => {
  beforeEach(() => {
    useProjectorStore.getState().reset();
    MockWebviewWindow.instances = [];
    channelListenerRef.current = undefined;
    vi.stubGlobal("navigator", undefined);
    // projectorOutput.ts assumes a browser `window` (URL construction, creation timeout);
    // this test file runs under vitest's "node" environment, so provide a minimal stand-in.
    vi.stubGlobal("window", {
      location: { href: "http://localhost/index.html", search: "" },
      setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
      clearTimeout: (...args: Parameters<typeof clearTimeout>) => clearTimeout(...args),
      setInterval: vi.fn(() => 1),
      clearInterval: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("includes LIVE playback in projector snapshots", () => {
    useProjectorStore.getState().setLivePlayback({ playing: false, looping: false });
    useProjectorStore.getState().seekLivePlayback(8);
    expect(snapshotProjectorState().playback).toEqual({ playing: false, looping: false, seekTime: 8, seekRevision: 1 });
  });

  it("retries the latest LIVE state while the output is connected", async () => {
    const cleanup = await startProjectorOutputBridge();
    const browserWindow = window as unknown as { setInterval: ReturnType<typeof vi.fn>; clearInterval: ReturnType<typeof vi.fn> };
    const retry = browserWindow.setInterval.mock.calls[0][0] as () => void;
    useProjectorStore.getState().setOutputStatus("connected");
    useProjectorStore.getState().setFeedOverride("live");
    await publishProjectorSnapshot();
    const before = postMessageMock.mock.calls.length;
    await retry();
    await Promise.resolve();
    expect(postMessageMock.mock.calls.length).toBeGreaterThan(before);

    const acknowledged = postMessageMock.mock.calls.at(-1)?.[0] as { snapshot: { revision: number } };
    channelListenerRef.current?.({ type: "ack", revision: acknowledged.snapshot.revision });
    const afterAck = postMessageMock.mock.calls.length;
    await retry();
    await Promise.resolve();
    expect(postMessageMock.mock.calls.length).toBe(afterAck);

    cleanup();
    expect(browserWindow.clearInterval).toHaveBeenCalledWith(1);
  });

  it("discovers displays and maps native refresh rate / primary flags", async () => {
    availableMonitorsMock.mockResolvedValueOnce([primary, secondary]);
    primaryMonitorMock.mockResolvedValueOnce(primary);
    invokeMock.mockImplementationOnce(async () => [nativePrimary, nativeSecondary]);

    const displays = await discoverDisplays();

    expect(displays).toHaveLength(2);
    expect(displays[0]).toMatchObject({ isPrimary: true, refreshHz: 60, width: 1920, height: 1080 });
    expect(displays[1]).toMatchObject({ isPrimary: false, refreshHz: 75, x: 1920 });
  });

  it("falls back to a null refresh rate when no native match is found", async () => {
    availableMonitorsMock.mockResolvedValueOnce([primary]);
    primaryMonitorMock.mockResolvedValueOnce(primary);
    invokeMock.mockImplementationOnce(async () => []);

    const [display] = await discoverDisplays();

    expect(display.refreshHz).toBeNull();
    expect(display.connected).toBe(true);
  });

  it("produces stable ids for the same display across repeated calls", async () => {
    availableMonitorsMock.mockResolvedValue([primary, secondary]);
    primaryMonitorMock.mockResolvedValue(primary);
    invokeMock.mockImplementation(async (command: string) => (
      command === "list_display_info" ? [nativePrimary, nativeSecondary] : true
    ));

    const first = await discoverDisplays();
    const second = await discoverDisplays();

    expect(first.map((d) => d.id)).toEqual(second.map((d) => d.id));
    expect(first[0].id).not.toBe(first[1].id);
  });

  it("selectedDisplay resolves the entry matching the store's selectedDisplayId", () => {
    const store = useProjectorStore.getState();
    const display = { id: "display-a", name: "A", friendlyName: "A", width: 1920, height: 1080, refreshHz: 60, x: 0, y: 0, scaleFactor: 1, isPrimary: true, connected: true };

    expect(selectedDisplay()).toBeNull();

    store.setAvailableDisplays([display]);
    store.selectDisplay("display-a");
    expect(selectedDisplay()).toEqual(display);

    store.selectDisplay("missing-id");
    expect(selectedDisplay()).toBeNull();
  });

  it("opens the output window on the requested display and marks it connected", async () => {
    const display = { id: "display-hdmi", name: "DISPLAY2", friendlyName: "HDMI Projector", width: 1920, height: 1080, refreshHz: 60, x: 1920, y: 0, scaleFactor: 1, isPrimary: false, connected: true };

    await openProjectorOutput(display);

    const state = useProjectorStore.getState();
    expect(state.outputStatus).toBe("connected");
    expect(state.selectedDisplayId).toBe("display-hdmi");
    expect(MockWebviewWindow.instances).toHaveLength(1);
    expect(MockWebviewWindow.instances[0].label).toBe(PROJECTOR_OUTPUT_LABEL);
    expect(MockWebviewWindow.instances[0].options).toMatchObject({
      decorations: false,
      resizable: false,
      skipTaskbar: true,
      x: 1920,
      y: 0,
      width: 1920,
      height: 1080,
    });
    expect(invokeMock).toHaveBeenCalledWith("place_projector_window", expect.objectContaining({ x: 1920, y: 0, width: 1920, height: 1080 }));
    expect(postMessageMock).toHaveBeenCalledWith({ type: "state", snapshot: expect.any(Object) });
  });

  it("reuses the existing window and skips repositioning when the display fingerprint is unchanged", async () => {
    const display = { id: "display-hdmi", name: "DISPLAY2", friendlyName: "HDMI Projector", width: 1920, height: 1080, refreshHz: 60, x: 1920, y: 0, scaleFactor: 1, isPrimary: false, connected: true };

    await openProjectorOutput(display);
    const placeCallsAfterFirstOpen = invokeMock.mock.calls.filter(([command]) => command === "place_projector_window").length;

    await openProjectorOutput(display);

    expect(MockWebviewWindow.instances).toHaveLength(1);
    const placeCallsAfterSecondOpen = invokeMock.mock.calls.filter(([command]) => command === "place_projector_window").length;
    expect(placeCallsAfterSecondOpen).toBe(placeCallsAfterFirstOpen);
    expect(MockWebviewWindow.instances[0].show).toHaveBeenCalledTimes(2);
  });

  it("repositions when switching to a different display", async () => {
    const displayA = { id: "display-a", name: "DISPLAY1", friendlyName: "A", width: 1920, height: 1080, refreshHz: 60, x: 0, y: 0, scaleFactor: 1, isPrimary: true, connected: true };
    const displayB = { id: "display-b", name: "DISPLAY2", friendlyName: "B", width: 2560, height: 1440, refreshHz: 60, x: 1920, y: 0, scaleFactor: 1, isPrimary: false, connected: true };

    await openProjectorOutput(displayA);
    await openProjectorOutput(displayB);

    const placeCalls = invokeMock.mock.calls.filter(([command]) => command === "place_projector_window");
    expect(placeCalls).toHaveLength(2);
    expect(useProjectorStore.getState().selectedDisplayId).toBe("display-b");
  });

  it("sets status to error when there is no display to open", async () => {
    await openProjectorOutput(null as unknown as undefined);
    expect(useProjectorStore.getState().outputStatus).toBe("error");
    expect(MockWebviewWindow.instances).toHaveLength(0);
  });

  it("hideProjectorOutput and closeProjectorOutput are no-ops when no window exists", async () => {
    await expect(hideProjectorOutput()).resolves.toBeUndefined();
    await expect(closeProjectorOutput()).resolves.toBeUndefined();
    expect(useProjectorStore.getState().outputStatus).toBe("closed");
  });

  it("hideProjectorOutput hides and closeProjectorOutput closes an open window", async () => {
    const display = { id: "display-hdmi", name: "DISPLAY2", friendlyName: "HDMI Projector", width: 1920, height: 1080, refreshHz: 60, x: 1920, y: 0, scaleFactor: 1, isPrimary: false, connected: true };
    await openProjectorOutput(display);
    const [window] = MockWebviewWindow.instances;

    await hideProjectorOutput();
    expect(window.hide).toHaveBeenCalledTimes(1);

    await closeProjectorOutput();
    expect(window.close).toHaveBeenCalledTimes(1);
    expect(useProjectorStore.getState().outputStatus).toBe("closed");
  });

  it("isProjectorOutputWindow reads the window query param", () => {
    vi.stubGlobal("window", { location: { search: "?window=projector" } });
    expect(isProjectorOutputWindow()).toBe(true);

    vi.stubGlobal("window", { location: { search: "" } });
    expect(isProjectorOutputWindow()).toBe(false);
  });
});
