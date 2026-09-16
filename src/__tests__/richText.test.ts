import { describe, expect, it } from "vitest";

import { resolveRichTextTokens } from "../lib/richText";

describe("resolveRichTextTokens", () => {
  it("resolves {scripture_version} and {scripture_name} tokens", () => {
    const text = "{scripture_reference}\n{scripture_text}\n{scripture_version}";
    const replacements = {
      scripture_reference: "2 Samuel 5:6",
      scripture_text: "David took the stronghold.",
      scripture_version: "NKJV",
      scripture_name: "NKJV",
    };

    const resolved = resolveRichTextTokens(text, replacements);
    expect(resolved).toContain("2 Samuel 5:6");
    expect(resolved).toContain("David took the stronghold.");
    expect(resolved).toContain("NKJV");
  });
});
