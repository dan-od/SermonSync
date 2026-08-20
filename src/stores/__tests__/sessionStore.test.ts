import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSessionStore } from "../sessionStore";

describe("sessionStore", () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  it("transitions lifecycle start/pause/resume/end", () => {
    const store = useSessionStore.getState();

    store.start("UNIT-001");
    expect(useSessionStore.getState().status).toBe("active");

    useSessionStore.getState().pause();
    expect(useSessionStore.getState().status).toBe("paused");

    useSessionStore.getState().resume();
    expect(useSessionStore.getState().status).toBe("active");

    useSessionStore.getState().end();
    expect(useSessionStore.getState().status).toBe("ended");
  });

  it("calls the sidecar session lifecycle endpoints", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ id: "sidecar-session-1", status: "active" }),
    } as Response);

    useSessionStore.getState().start("UNIT-001", "Test Unit");
    useSessionStore.getState().end();

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:8000/api/session/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ unit_id: "UNIT-001", unit_name: "Test Unit" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:8000/api/session/end",
      expect.objectContaining({ method: "POST" }),
    );

    fetchMock.mockRestore();
  });

  it("applies sidecar system status telemetry", () => {
    useSessionStore.getState().applySystemStatus({
      type: "system_status",
      uptime_seconds: 120,
      latency_ms: 420,
      latency_avg_ms: 300,
      latency_peak_ms: 880,
      status: "degraded",
      alert: false,
      pipeline_stages_healthy: [true, true, false, true],
      stages: {
        capture: { avg_ms: 10, last_ms: 11, max_ms: 15, errors: 0, healthy: true },
      },
    });

    const state = useSessionStore.getState();
    expect(state.uptimeSeconds).toBe(120);
    expect(state.lastLatencyMs).toBe(420);
    expect(state.lastHealth).toBe("degraded");
  });
});
