import { describe, expect, it } from "vitest";

import { DEFAULT_TRANSITIONS, getTransitionSetting, normalizeTransitions } from "../transitions";

describe("transition enable setting", () => {
  it("defaults to enabled and preserves an explicit disabled setting", () => {
    expect(normalizeTransitions(undefined).enabled).toBe(true);
    expect(normalizeTransitions({ enabled: false }).enabled).toBe(false);
  });

  it("uses instant cuts while disabled without changing saved effects", () => {
    const config = normalizeTransitions({
      enabled: false,
      scriptures: { effect: "slide-left", durationMs: 500, easing: "ease-out" },
    });

    expect(getTransitionSetting(config, "scriptures")).toEqual({ effect: "cut", durationMs: 0, easing: "linear" });
    expect(config.scriptures).toEqual({ effect: "slide-left", durationMs: 500, easing: "ease-out" });
    expect(getTransitionSetting({ ...DEFAULT_TRANSITIONS, enabled: true }, "scriptures")).toEqual(DEFAULT_TRANSITIONS.scriptures);
  });
});
