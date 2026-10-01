import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DisplayInfo } from "../../lib/projectorOutput";

const bridge = vi.hoisted(() => ({
  listDisplays: vi.fn(),
  openProjectorWindow: vi.fn(),
  closeProjectorWindow: vi.fn(),
}));

vi.mock("../../lib/projectorOutput", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/projectorOutput")>();
  return {
    ...actual,
    isTauriRuntime: () => true,
    listDisplays: bridge.listDisplays,
    openProjectorWindow: bridge.openProjectorWindow,
    closeProjectorWindow: bridge.closeProjectorWindow,
  };
});

import { resolveDisplay } from "../../lib/projectorOutput";
import { useProjectorOutputStore } from "../projectorOutputStore";

function display(name: string, x: number, isOperatorDisplay = false): DisplayInfo {
  return {
    id: `${name}@${x},0`,
    name,
    width: 1920,
    height: 1080,
    x,
    y: 0,
    scaleFactor: 1,
    isPrimary: isOperatorDisplay,
    isOperatorDisplay,
  };
}

const laptop = display("Built-in Retina", 0, true);
const projector = display("EPSON PJ", 1920);

describe("resolveDisplay", () => {
  it("prefers an exact id match", () => {
    expect(resolveDisplay([laptop, projector], projector.id)).toBe(projector);
  });

  it("follows a display that came back at new coordinates by unique name", () => {
    const moved = display("EPSON PJ", -1920);
    expect(resolveDisplay([laptop, moved], projector.id)).toBe(moved);
  });

  it("never resolves to the operator screen by name", () => {
    const operatorTwin = display("LG TV", 0, true);
    expect(resolveDisplay([operatorTwin], "LG TV@1920,0")).toBeNull();
  });

  it("refuses an ambiguous name match", () => {
    expect(resolveDisplay([laptop, display("LG TV", 1920), display("LG TV", 3840)], "LG TV@5760,0")).toBeNull();
  });
});

describe("projectorOutputStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectorOutputStore.getState().reset();
    bridge.listDisplays.mockResolvedValue([laptop, projector]);
    bridge.closeProjectorWindow.mockResolvedValue(undefined);
    bridge.openProjectorWindow.mockImplementation(async (displayId: string | null, windowed: boolean) => ({
      open: true,
      windowed,
      display: displayId ? resolveDisplay([laptop, projector], displayId) : null,
    }));
  });

  it("defaults the selection to the first display that is not the operator screen", async () => {
    await useProjectorOutputStore.getState().refreshDisplays();
    expect(useProjectorOutputStore.getState().selectedDisplayId).toBe(projector.id);
  });

  it("opens full screen on the selected display", async () => {
    await useProjectorOutputStore.getState().refreshDisplays();
    await useProjectorOutputStore.getState().turnOn({ windowed: false });

    expect(bridge.openProjectorWindow).toHaveBeenCalledWith(projector.id, false);
    const state = useProjectorOutputStore.getState();
    expect(state.status).toBe("on");
    expect(state.outputEnabled).toBe(true);
    expect(state.activeDisplay?.id).toBe(projector.id);
  });

  it("parks when the display is unplugged and comes back when it is replugged", async () => {
    await useProjectorOutputStore.getState().refreshDisplays();
    await useProjectorOutputStore.getState().turnOn({ windowed: false });

    bridge.listDisplays.mockResolvedValue([laptop]);
    await useProjectorOutputStore.getState().reconcile();
    // Rust reports the window we just destroyed.
    useProjectorOutputStore.getState().handleWindowClosed();

    let state = useProjectorOutputStore.getState();
    expect(bridge.closeProjectorWindow).toHaveBeenCalledTimes(1);
    expect(state.status).toBe("waiting-for-display");
    expect(state.outputEnabled).toBe(true);
    expect(state.windowOpen).toBe(false);
    expect(state.selectedDisplayId).toBe(projector.id);

    bridge.listDisplays.mockResolvedValue([laptop, projector]);
    await useProjectorOutputStore.getState().reconcile();

    state = useProjectorOutputStore.getState();
    expect(bridge.openProjectorWindow).toHaveBeenLastCalledWith(projector.id, false);
    expect(state.status).toBe("on");
    expect(state.windowOpen).toBe(true);
  });

  it("waits instead of failing when the remembered display is not connected at startup", async () => {
    useProjectorOutputStore.setState({ selectedDisplayId: projector.id, outputEnabled: true });
    bridge.listDisplays.mockResolvedValue([laptop]);

    await useProjectorOutputStore.getState().turnOn({ windowed: false });

    expect(bridge.openProjectorWindow).not.toHaveBeenCalled();
    expect(useProjectorOutputStore.getState().status).toBe("waiting-for-display");
  });

  it("turns output off when the operator closes the window", async () => {
    await useProjectorOutputStore.getState().turnOn({ windowed: true });
    useProjectorOutputStore.getState().handleWindowClosed();

    const state = useProjectorOutputStore.getState();
    expect(state.outputEnabled).toBe(false);
    expect(state.status).toBe("off");
  });

  it("does not move a test window during reconcile", async () => {
    await useProjectorOutputStore.getState().turnOn({ windowed: true });
    bridge.listDisplays.mockResolvedValue([laptop]);

    await useProjectorOutputStore.getState().reconcile();

    expect(bridge.closeProjectorWindow).not.toHaveBeenCalled();
    expect(useProjectorOutputStore.getState().status).toBe("on");
  });
});
