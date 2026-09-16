import { beforeEach, describe, expect, it } from "vitest";

import { useAudioStore, useSessionStore, useSuggestionStore, useTranscriptionStore } from "../../stores";
import { dispatchSidecarEvent } from "../sidecarWs";

describe("sidecar websocket dispatch", () => {
  beforeEach(() => {
    useAudioStore.getState().reset();
    useSessionStore.getState().reset();
    useSuggestionStore.getState().clear();
    useTranscriptionStore.getState().reset();
  });

  it("routes audio level events to audio store", () => {
    dispatchSidecarEvent({
      type: "audio_level",
      rms: 0.31,
      peak: 0.62,
    });

    const state = useAudioStore.getState();
    expect(state.levelRms).toBe(0.31);
    expect(state.levelPeak).toBe(0.62);
  });

  it("routes context and suggestion events to their stores", () => {
    dispatchSidecarEvent({
      type: "context_update",
      themes: ["GRACE"],
      confidence: 0.7,
    });

    dispatchSidecarEvent({
      type: "suggestions",
      sentence: "sample",
      results: [
        {
          reference: "John 3:16",
          book: "John",
          chapter: 3,
          verse: 16,
          text: "For God so loved the world",
          version: "KJV",
          confidence: 0.88,
          confidence_pct: 88,
          stage: 2,
          source_stages: [2],
        },
      ],
    });

    dispatchSidecarEvent({
      type: "sentence",
      text: "For God so loved the world.",
      timestamp: 1700000000000,
      context: ["salvation"],
    });

    expect(useTranscriptionStore.getState().themes).toEqual(["GRACE"]);
    expect(useTranscriptionStore.getState().timeline[0]?.text).toBe("For God so loved the world.");
    expect(useSuggestionStore.getState().cards).toHaveLength(1);
    expect(useSuggestionStore.getState().cards[0]?.reference).toEqual({ book: "John", chapter: 3, verse: 16 });
    expect(useSuggestionStore.getState().cards[0]?.themes).toEqual(["GRACE"]);
  });

  it("routes system status to session and audio latency", () => {
    dispatchSidecarEvent({
      type: "system_status",
      uptime_seconds: 333,
      latency_ms: 222,
      latency_avg_ms: 200,
      latency_peak_ms: 600,
      status: "stable",
      alert: false,
      pipeline_stages_healthy: [true, true, true, true],
      stages: {
        capture: { avg_ms: 10, last_ms: 10, max_ms: 15, errors: 0, healthy: true },
      },
    });

    expect(useSessionStore.getState().uptimeSeconds).toBe(333);
    expect(useSessionStore.getState().lastLatencyMs).toBe(222);
    expect(useAudioStore.getState().latencyMs).toBe(222);
  });
});
