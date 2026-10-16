import { describe, expect, it } from "vitest";

import { knownScriptureBooks, resolveScriptureReference } from "../scriptureSearch";

describe("scripture reference parsing with the shared book table", () => {
  it("lists the 66 canonical books in bible.db naming", () => {
    expect(knownScriptureBooks).toHaveLength(66);
    expect(knownScriptureBooks).toContain("Psalms");
    expect(knownScriptureBooks).toContain("Song of Solomon");
  });

  it.each([
    ["John 3:16", "John 3:16"],
    ["Psalm 23:1", "Psalms 23:1"],
    ["1st John 1:9", "1 John 1:9"],
    ["First Corinthians 13:4-7", "1 Corinthians 13:4"],
    ["II Kings 2:9", "2 Kings 2:9"],
    ["Song of Songs 8:6", "Song of Solomon 8:6"],
    ["Revelations 3:20", "Revelation 3:20"],
    ["Phil 4:13", "Philippians 4:13"],
  ])("%s -> %s", (query, expected) => {
    expect(resolveScriptureReference(query)?.value).toBe(expected);
  });

  it("does not treat ASR homophones as typed book names", () => {
    expect(resolveScriptureReference("Michael 6:8")).toBeNull();
  });
});
