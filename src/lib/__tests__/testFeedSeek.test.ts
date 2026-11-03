import { describe, expect, it } from "vitest";

import {
  SEEK_LEAD_SECONDS,
  clampTime,
  cueAt,
  detectedMarkerLabel,
  formatClock,
  isEditableTarget,
  leadIn,
  parseClock,
  seekStepForKey,
  timeAtOffset,
} from "../testFeedSeek";

const cues = [
  { start: 0, end: 4, text: "Good morning church" },
  { start: 4, end: 8, text: "turn with me to John" },
  { start: 20, end: 24, text: "and in Romans eight" },
];

describe("test feed seek helpers (SS-072)", () => {
  it("formats h:mm:ss", () => {
    expect(formatClock(0)).toBe("0:00:00");
    expect(formatClock(2535.9)).toBe("0:42:15");
    expect(formatClock(3723)).toBe("1:02:03");
  });

  it("parses typed times", () => {
    expect(parseClock("42:15")).toBe(2535);
    expect(parseClock(" 1:02:03 ")).toBe(3723);
    expect(parseClock("90")).toBe(90);
    expect(parseClock("1:30.5")).toBe(90.5);
    expect(parseClock("4:75")).toBeNull();
    expect(parseClock("John 3")).toBeNull();
    expect(parseClock("")).toBeNull();
  });

  it("lands every jump 10 s early, inside the media", () => {
    expect(SEEK_LEAD_SECONDS).toBe(10);
    expect(leadIn(2535, 4000)).toBe(2525);
    expect(leadIn(4, 4000)).toBe(0);
    expect(leadIn(5000, 4000)).toBe(3999);
    expect(clampTime(-5, 100)).toBe(0);
    expect(clampTime(130, 100)).toBe(99);
  });

  it("finds the caption line at a time", () => {
    expect(cueAt(cues, 5)?.text).toBe("turn with me to John");
    expect(cueAt(cues, 9)?.text).toBe("turn with me to John"); // short pause after it
    expect(cueAt(cues, 15)).toBeNull(); // long silence
    expect(cueAt(cues, 22)?.text).toBe("and in Romans eight");
    expect(cueAt([], 3)).toBeNull();
  });

  it("maps a pointer offset to a time", () => {
    expect(timeAtOffset(50, 200, 3600)).toBe(900);
    expect(timeAtOffset(-10, 200, 3600)).toBe(0);
    expect(timeAtOffset(250, 200, 3600)).toBe(3600);
  });
});

describe("test feed seek keys and labels (SS-075)", () => {
  it("steps 5 s on the arrows and 30 s with Shift", () => {
    expect(seekStepForKey({ key: "ArrowRight", shiftKey: false })).toBe(5);
    expect(seekStepForKey({ key: "ArrowLeft", shiftKey: false })).toBe(-5);
    expect(seekStepForKey({ key: "ArrowRight", shiftKey: true })).toBe(30);
    expect(seekStepForKey({ key: "ArrowLeft", shiftKey: true })).toBe(-30);
    expect(seekStepForKey({ key: "ArrowUp", shiftKey: false })).toBeNull();
    expect(seekStepForKey({ key: "a", shiftKey: false })).toBeNull();
  });

  it("leaves arrow keys to fields that use them", () => {
    expect(isEditableTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: "textarea" } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: "BUTTON" } as unknown as EventTarget)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });

  it("labels a detected marker with its confidence", () => {
    expect(detectedMarkerLabel({ reference: "John 3:16", confidence: 0.991 })).toBe("John 3:16 — 99.1%");
  });
});
