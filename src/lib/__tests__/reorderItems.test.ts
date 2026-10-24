import { describe, expect, it } from "vitest";

import { reorderItems } from "../reorderItems";

const items = [{ id: "one" }, { id: "two" }, { id: "three" }];

describe("reorderItems", () => {
  it("moves an item before or after the drop target", () => {
    expect(reorderItems(items, "one", "three", "after").map((item) => item.id))
      .toEqual(["two", "three", "one"]);
    expect(reorderItems(items, "three", "one", "before").map((item) => item.id))
      .toEqual(["three", "one", "two"]);
  });

  it("leaves the list unchanged for invalid or identical targets", () => {
    expect(reorderItems(items, "missing", "one", "before")).toBe(items);
    expect(reorderItems(items, "one", "one", "after")).toBe(items);
  });
});