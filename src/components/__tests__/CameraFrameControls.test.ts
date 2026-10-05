import { describe, expect, it } from "vitest";

import type { TemplateBackgroundMedia } from "../../types/templates";
import { snapCameraFrame, transformCameraFrame } from "../../lib/cameraFrame";

const camera: TemplateBackgroundMedia = {
  type: "camera", src: "", fit: "cover", loop: false,
  x: 0, y: 0, width: 100, height: 100, opacity: 1,
};

describe("template camera frame editing", () => {
  it("resizes the frame into either half of the canvas and keeps it inside the canvas", () => {
    expect(transformCameraFrame(camera, "w", "frame", 50, 0)).toMatchObject({ x: 50, width: 50 });
    expect(transformCameraFrame(camera, "e", "frame", -50, 0)).toMatchObject({ x: 0, width: 50 });
    expect(transformCameraFrame(camera, "w", "frame", 150, 0)).toMatchObject({ x: 95, width: 5 });
  });

  it("crops a source without rescaling the visible frame and can reverse the crop", () => {
    const cropped = transformCameraFrame(camera, "w", "crop", 25, 0);
    expect(cropped).toMatchObject({ x: 25, width: 75, cropLeft: 25 });
    expect(transformCameraFrame(cropped, "w", "crop", -25, 0)).toMatchObject({ x: 0, width: 100, cropLeft: 0 });
  });

  it("snaps camera movement and resize handles to canvas and layer guides", () => {
    const half = { ...camera, x: 10, y: 10, width: 30, height: 30 };
    const targets = { vertical: [0, 50, 100], horizontal: [0, 50, 100] };
    const moved = snapCameraFrame(half, "move", "frame", 9.4, 9.5, targets, { width: 1000, height: 1000 });
    expect(moved.media).toMatchObject({ x: 20, y: 20 });
    expect(moved.guides).toEqual({ vertical: [50], horizontal: [50] });

    const resized = snapCameraFrame(half, "se", "frame", 9.5, 9.6, targets, { width: 1000, height: 1000 });
    expect(resized.media).toMatchObject({ x: 10, y: 10, width: 40, height: 40 });
    expect(resized.guides).toEqual({ vertical: [50], horizontal: [50] });
  });
});
