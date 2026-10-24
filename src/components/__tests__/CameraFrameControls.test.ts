// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { CameraFrameControls } from "../Templates/CameraFrameControls";
import type { TemplateBackgroundMedia } from "../../types/templates";
import { snapCameraFrame, transformCameraFrame } from "../../lib/cameraFrame";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

  it("moves the camera by dragging inside its frame", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const changes: TemplateBackgroundMedia[] = [];
    const media = { ...camera, x: 20, y: 10, width: 30, height: 40 };

    try {
      act(() => root.render(createElement(CameraFrameControls, {
        media,
        mode: "frame",
        getSnapTargets: () => ({ vertical: [], horizontal: [] }),
        onStart: () => undefined,
        onChange: (next) => changes.push(next),
        onGuides: () => undefined,
        onEnd: () => undefined,
      })));

      const moveButton = container.querySelector<HTMLButtonElement>('button[aria-label="Move camera frame"]');
      expect(moveButton).not.toBeNull();
      const stage = container.firstElementChild!;
      stage.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000, toJSON: () => ({}) });
      Object.defineProperty(moveButton, "setPointerCapture", { value: () => undefined });

      act(() => moveButton!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 300, clientY: 200 })));
      act(() => moveButton!.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, button: 0, clientX: 400, clientY: 300 })));

      expect(changes.at(-1)).toMatchObject({ x: 30, y: 20, width: 30, height: 40 });
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });
});
