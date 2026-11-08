import { describe, expect, it } from "vitest";
import { updateLibrarySearchQuery, type LibrarySearchQueries } from "../librarySearchState";

describe("per-tab library search state", () => {
  it("updates one tab without changing the other tab queries", () => {
    const initial: LibrarySearchQueries = {
      scriptures: "psalm 23",
      songs: "amazing grace",
      media: "",
      overlays: "",
      templates: "",
    };

    const updated = updateLibrarySearchQuery(initial, "songs", "how great thou art");

    expect(updated).toEqual({ ...initial, songs: "how great thou art" });
    expect(initial.songs).toBe("amazing grace");
    expect(updated.scriptures).toBe("psalm 23");
  });

  it("supports functional updates and preserves identity for no-op updates", () => {
    const initial: LibrarySearchQueries = { scriptures: "", songs: "grace", media: "", overlays: "", templates: "" };
    expect(updateLibrarySearchQuery(initial, "songs", (query) => `${query} hymn`).songs).toBe("grace hymn");
    expect(updateLibrarySearchQuery(initial, "songs", "grace")).toBe(initial);
  });
});
