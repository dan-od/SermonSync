// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cameraFeeds } = vi.hoisted(() => ({ cameraFeeds: vi.fn() }));

vi.mock("../CameraFeed", () => ({
  CameraFeed: ({ paused }: { paused?: boolean }) => {
    cameraFeeds(paused);
    return <div data-camera-paused={String(Boolean(paused))} />;
  },
}));
vi.mock("../../lib/projectionScene", () => ({
  projectionScene: () => ({
    layers: [],
    backgroundMedia: {
      type: "camera", src: "", fit: "cover", x: 0, y: 0, width: 100, height: 100,
      opacity: 1, cameraSourceType: "local", cameraDeviceId: "test-camera",
    },
  }),
}));
vi.mock("../../stores/templateStore", () => ({
  useTemplateStore: (selector: (state: unknown) => unknown) => selector({
    templates: [{ id: "camera-template", category: "scriptures", layout: "widescreen" }],
    defaults: { scriptures: { widescreen: "camera-template" }, songs: {} },
  }),
}));
vi.mock("../../stores/projectorStore", () => ({
  useProjectorStore: (selector: (state: unknown) => unknown) => selector({
    logo: { src: null, fit: "contain" }, transitions: {},
  }),
}));

import { ProjectorView } from "../ProjectorView";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("camera preview controls", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    cameraFeeds.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("pauses only the preview camera and resumes it without changing the live feed", () => {
    const slide = { reference: { book: "John", chapter: 3, verse: 16 }, text: "Verse", version: "KJV" };
    act(() => {
      root.render(<>
        <ProjectorView title="PREVIEW" slide={slide} feedOverride="live" overlayMode="widescreen" theme="cross" isLive={false} fontSizePx={48} />
        <ProjectorView title="LIVE" slide={slide} feedOverride="live" overlayMode="widescreen" theme="cross" isLive fontSizePx={48} chrome={false} />
      </>);
    });

    const pause = container.querySelector<HTMLButtonElement>('button[aria-label="Pause PREVIEW camera"]');
    expect(pause?.disabled).toBe(false);
    expect(container.querySelectorAll('[data-camera-paused="false"]')).toHaveLength(2);
    expect(container.querySelector<HTMLInputElement>('input[aria-label="PREVIEW video progress"]')).toBeNull();
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Disable loop for PREVIEW video"]')?.disabled).toBe(true);

    act(() => pause?.click());
    expect(container.querySelectorAll('[data-camera-paused="true"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-camera-paused="false"]')).toHaveLength(1);

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Resume PREVIEW camera"]')?.click());
    expect(container.querySelectorAll('[data-camera-paused="false"]')).toHaveLength(2);
  });
});
