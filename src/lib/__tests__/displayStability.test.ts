import { describe, expect, it } from "vitest";

import { EMPTY_DISPLAY_STABILITY, observeConnectedDisplay } from "../displayStability";

describe("connected display stability", () => {
  it("keeps a projected frame during a brief missing monitor reading", () => {
    let state = observeConnectedDisplay(EMPTY_DISPLAY_STABILITY, "HDMI:1920x1080").state;
    const missing = observeConnectedDisplay(state, null);
    expect(missing.action).toBe("none");
    state = observeConnectedDisplay(missing.state, "HDMI:1920x1080").state;
    expect(state.missingReads).toBe(0);
    expect(state.confirmedFingerprint).toBe("HDMI:1920x1080");
  });

  it("disconnects only after three consecutive missing readings", () => {
    let state = observeConnectedDisplay(EMPTY_DISPLAY_STABILITY, "HDMI:1920x1080").state;
    for (let read = 0; read < 2; read += 1) {
      const result = observeConnectedDisplay(state, null);
      expect(result.action).toBe("none");
      state = result.state;
    }
    expect(observeConnectedDisplay(state, null).action).toBe("disconnect");
  });

  it("ignores one geometry glitch but repositions after a stable change", () => {
    let state = observeConnectedDisplay(EMPTY_DISPLAY_STABILITY, "HDMI:1920x1080").state;
    const jitter = observeConnectedDisplay(state, "HDMI:1919x1080");
    expect(jitter.action).toBe("none");
    state = observeConnectedDisplay(jitter.state, "HDMI:1920x1080").state;
    expect(state.changedReads).toBe(0);
    state = observeConnectedDisplay(state, "HDMI:1280x720").state;
    state = observeConnectedDisplay(state, "HDMI:1280x720").state;
    const stable = observeConnectedDisplay(state, "HDMI:1280x720");
    expect(stable.action).toBe("reposition");
    expect(stable.state.confirmedFingerprint).toBe("HDMI:1280x720");
  });
});
