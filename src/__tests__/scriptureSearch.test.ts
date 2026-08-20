import { describe, expect, it } from "vitest";

import { resolveScriptureSearch, searchScripturePassages } from "../lib/scriptureSearch";

describe("resolveScriptureSearch", () => {
  it("parses a space-separated chapter and verse reference", () => {
    const result = resolveScriptureSearch("John 3 16");

    expect(result).not.toBeNull();
    expect(result?.reference).toMatchObject({
      book: "John",
      chapter: 3,
      verse: 16,
    });
  });

  it("parses a direct reference with a colon", () => {
    const result = resolveScriptureSearch("Romans 8:28");

    expect(result).not.toBeNull();
    expect(result?.reference).toMatchObject({
      book: "Romans",
      chapter: 8,
      verse: 28,
    });
  });

  it("parses a multi-word book name instead of matching only the first token", () => {
    const result = resolveScriptureSearch("1 Corinthians 13:4");

    expect(result).not.toBeNull();
    expect(result?.reference).toMatchObject({
      book: "1 Corinthians",
      chapter: 13,
      verse: 4,
    });
  });

  it("collapses a verse range to its opening verse", () => {
    const result = resolveScriptureSearch("Song of Solomon 2:1-4");

    expect(result).not.toBeNull();
    expect(result?.reference).toMatchObject({
      book: "Song of Solomon",
      chapter: 2,
      verse: 1,
    });
  });

  it("matches descriptive scripture text to the closest passage", () => {
    const result = resolveScriptureSearch("for god so loved the world");

    expect(result).not.toBeNull();
    expect(result?.reference).toMatchObject({
      book: "John",
      chapter: 3,
      verse: 16,
    });
  });

  it("matches a partial phrase to its scripture reference", () => {
    const result = resolveScriptureSearch("in the beginning");

    expect(result).not.toBeNull();
    expect(result?.reference).toMatchObject({
      book: "John",
      chapter: 1,
      verse: 1,
    });
  });

  it("ranks fuzzy passage matches with the best result first", () => {
    const results = searchScripturePassages("healing stripes");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].reference).toMatchObject({
      book: "Isaiah",
      chapter: 53,
      verse: 5,
    });
  });
});
