import { beforeEach, describe, expect, it } from "vitest";

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
