// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/sidecarClient", () => ({ getSidecarHttpBase: () => "http://127.0.0.1:8000" }));

import { useEngineStatus } from "../useEngineStatus";
import { useTestFeedStore } from "../../stores/testFeedStore";
import type { SidecarTestFeedEvent } from "../../types/state";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ enabled }: { enabled: boolean }) {
  useEngineStatus(enabled);
  return null;
}

describe("engine status test feed handoff", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    useTestFeedStore.setState({ enabled: false, status: null });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("reads the sidecar flag and initial feed status after sign-in", async () => {
    const feed: SidecarTestFeedEvent = {
      type: "test_feed", state: "playing", title: "Service recording", source: "file",
      position: 4, start: 0, end: null, speed: 1,
    };
    const fetchStatus = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: "0.1.0", dev_feed: true, test_feed: feed }),
    });
    vi.stubGlobal("fetch", fetchStatus);

    await act(async () => root.render(<Probe enabled={false} />));
    expect(fetchStatus).not.toHaveBeenCalled();

    await act(async () => root.render(<Probe enabled={true} />));
    expect(fetchStatus).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/engine/status", expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(useTestFeedStore.getState().enabled).toBe(true);
    expect(useTestFeedStore.getState().status).toEqual(feed);
  });
});
