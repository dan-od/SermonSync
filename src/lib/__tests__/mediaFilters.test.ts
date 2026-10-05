import { describe, expect, it } from "vitest";

import { filtersToCss } from "../mediaFilters";

describe("media filter CSS", () => {
  it("does not create a compositing filter for an unchanged thumbnail", () => {
    expect(filtersToCss(undefined)).toBe("none");
    expect(filtersToCss({ brightness: 100, contrast: 100, saturate: 100, grayscale: 0, sepia: 0, invert: 0, hueRotate: 0, blur: 0 })).toBe("none");
  });

  it("keeps only the image adjustments the user applied", () => {
    expect(filtersToCss({ brightness: 90, contrast: 100, saturate: 100, grayscale: 0, sepia: 0, invert: 0, hueRotate: 0, blur: 2 })).toBe("brightness(90%) blur(2px)");
  });
});
