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
});
