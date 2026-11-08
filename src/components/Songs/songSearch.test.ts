import { describe, expect, it } from "vitest";
import { normalizeSongHeadings, parseImportedSongText } from "./songSearch";

describe("song search import normalization", () => {
  it("normalizes common headings and preserves custom headings", () => {
    expect(normalizeSongHeadings("[Verse 1]\nA line\n\nRefrain:\nSing\n\n[My Special Part]\nMore"))
      .toBe("[Verse 1]\nA line\n\n[Chorus]\nSing\n\n[My Special Part]\nMore");
  });

  it("imports instrumental only and combined lyric/instrumental sections", () => {
    expect(parseImportedSongText("", "instrumental")).toEqual([{ label: "Instrumental", text: "Instrumental" }]);
    expect(parseImportedSongText("[Verse 1]\nWords\n\nInstrumental:\nPiano", "both")).toEqual([
      { label: "Verse 1", text: "Words" },
      { label: "Instrumental", text: "Piano" },
    ]);
  });

  it("places unheaded imported text into a verse", () => {
    expect(parseImportedSongText("First line\nSecond line", "lyrics")).toEqual([{ label: "Verse 1", text: "First line\nSecond line" }]);
  });
});
