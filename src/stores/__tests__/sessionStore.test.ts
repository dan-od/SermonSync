import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSessionStore } from "../sessionStore";

describe("sessionStore", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ id: "sidecar-session-1", status: "active" }),
    } as Response);
    useSessionStore.getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("transitions lifecycle start/pause/resume/end", async () => {
    const store = useSessionStore.getState();

    store.start("UNIT-001");
    expect(useSessionStore.getState().status).toBe("active");

    useSessionStore.getState().pause();
    expect(useSessionStore.getState().status).toBe("paused");

    useSessionStore.getState().resume();
    expect(useSessionStore.getState().status).toBe("active");

    await useSessionStore.getState().end();
    expect(useSessionStore.getState().status).toBe("ended");
  });

  it("calls the sidecar session lifecycle endpoints", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);

    useSessionStore.getState().start("UNIT-001", "Test Unit");
    await useSessionStore.getState().end();

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

  });

  it("does not restore a previous run's active session or timer", async () => {
    const oldSession = JSON.stringify({
      state: { id: "old", status: "active", startTime: 1, elapsed: 999, unitId: "OLD" },
      version: 0,
    });
    vi.stubGlobal("window", { localStorage: { getItem: () => oldSession } });
    vi.resetModules();
    const { useSessionStore: freshStore } = await import("../sessionStore");

    expect(freshStore.getState()).toMatchObject({
      id: null,
      status: "idle",
      startTime: null,
      elapsed: 0,
    });
    freshStore.getState().start("NEW");
    expect(freshStore.getState()).toMatchObject({ status: "active", elapsed: 0, unitId: "NEW" });
    await freshStore.getState().end();
  });

  it("finishes the start request before ending the session", async () => {
    let resolveStart!: (response: Response) => void;
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => {
      resolveStart = resolve;
    }));

    useSessionStore.getState().start("UNIT-001");
    const ending = useSessionStore.getState().end();
    const closing = useSessionStore.getState().end();
    expect(useSessionStore.getState().status).toBe("ended");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveStart({ ok: true, json: async () => ({ id: "sidecar-session-1" }) } as Response);
    await Promise.all([ending, closing]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useSessionStore.getState().id).toBe("sidecar-session-1");
  });

  it("waits for an in-flight end before starting another session and resets elapsed", async () => {
    let resolveEnd!: (response: Response) => void;
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "first" }) } as Response);
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => {
      resolveEnd = resolve;
    }));

    useSessionStore.getState().start("FIRST");
    await vi.waitFor(() => expect(useSessionStore.getState().id).toBe("first"));
    useSessionStore.getState().tick(75);
    const ending = useSessionStore.getState().end();
    useSessionStore.getState().start("SECOND");
    expect(useSessionStore.getState()).toMatchObject({ status: "active", elapsed: 0, unitId: "SECOND" });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    resolveEnd({ ok: true, json: async () => ({ id: "first", status: "ended" }) } as Response);
    await ending;
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
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
