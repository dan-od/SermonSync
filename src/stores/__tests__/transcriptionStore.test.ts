import { beforeEach, describe, expect, it } from "vitest";

import { useTranscriptionStore } from "../transcriptionStore";

describe("transcriptionStore", () => {
  beforeEach(() => {
    useTranscriptionStore.getState().reset();
  });

  it("tracks partial transcription fragments", () => {
    useTranscriptionStore.getState().ingestTranscription({
      type: "transcription",
      text: "hello wor",
      timestamp: 1,
      is_final: false,
      confidence: 0.75,
      language: "en",
    });

    expect(useTranscriptionStore.getState().latestPartial).toBe("hello wor");
  });

  it("adds sentence event to timeline and clears partial", () => {
    const store = useTranscriptionStore.getState();

    store.ingestTranscription({
      type: "transcription",
      text: "hello wor",
      timestamp: 1,
      is_final: false,
      confidence: 0.75,
      language: "en",
    });

    store.ingestSentence({
      type: "sentence",
      text: "hello world.",
      timestamp: 2,
      context: ["before"],
    });

    const state = useTranscriptionStore.getState();
    expect(state.latestPartial).toBe("");
    expect(state.timeline.length).toBeGreaterThan(0);
    expect(state.contextWindow).toEqual(["before"]);
  });

  // SS-077: the sidecar stamps events with Python time.time() — epoch seconds.
  // Treating them as milliseconds put the whole transcript in 1970 and gave
  // every entry the same displayed clock, which read as skipped words.
  it("renders sidecar epoch-second timestamps as wall-clock time", () => {
    const epochSeconds = Date.UTC(2026, 10, 5, 13, 17, 36) / 1000;
    useTranscriptionStore.getState().ingestTranscription({
      type: "transcription",
      text: "every time you open the scripture",
      timestamp: epochSeconds,
      is_final: true,
      confidence: 0.9,
      language: "en",
    });

    const [item] = useTranscriptionStore.getState().timeline;
    const expected = new Date(epochSeconds * 1000).toLocaleTimeString("en-GB", { hour12: false });
    expect(item.timestamp).toBe(expected);
    expect(item.timestamp).not.toBe(
      new Date(epochSeconds).toLocaleTimeString("en-GB", { hour12: false }),
    );
  });

  it("leaves millisecond timestamps alone, so manual entries stay correct", () => {
    const nowMs = Date.UTC(2026, 10, 5, 13, 17, 36);
    useTranscriptionStore.getState().ingestTranscription({
      type: "transcription",
      text: "already in milliseconds",
      timestamp: nowMs,
      is_final: true,
      confidence: 0.9,
      language: "en",
    });

    const [item] = useTranscriptionStore.getState().timeline;
    expect(item.timestamp).toBe(new Date(nowMs).toLocaleTimeString("en-GB", { hour12: false }));
  });
});
