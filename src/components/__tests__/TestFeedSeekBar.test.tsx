// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const seekTestFeed = vi.fn(async (position: number) => ({ position }));
vi.mock("../../lib/sidecarClient", () => ({
  seekTestFeed: (position: number) => seekTestFeed(position),
  prepareTestFeed: vi.fn(),
}));

import { TestFeedSeekBar } from "../TestFeedSeekBar";
import { TranscriptTimelinePanel } from "../TranscriptTimelinePanel";
import { useTestFeedStore } from "../../stores/testFeedStore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A 100 px bar over a 200 s source: 1 px is 2 s.
const BAR_WIDTH = 100;
const DURATION = 200;

describe("TestFeedSeekBar interactions (SS-075)", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let onJump: ReturnType<typeof vi.fn<(seconds: number) => void>>;

  const render = (position = 100) =>
    act(() =>
      root.render(
        <TestFeedSeekBar
          duration={DURATION}
          position={position}
          playing
          cues={[]}
          markers={[{ time: 82, reference: "John 3:16", caption_text: "John three sixteen" }]}
          detected={[{ time: 150, reference: "Romans 8:28", confidence: 0.991 }]}
          onJump={onJump}
        />,
      ),
    );

  const slider = () => container.querySelector<HTMLElement>('[role="slider"]')!;
  const pointer = (type: string, clientX: number) =>
    act(() => {
      slider().dispatchEvent(new MouseEvent(type, { bubbles: true, clientX, button: 0 }));
    });
  const key = (k: string, shiftKey = false) =>
    act(() => {
      slider().dispatchEvent(new KeyboardEvent("keydown", { key: k, shiftKey, bubbles: true }));
    });

  beforeEach(() => {
    onJump = vi.fn<(seconds: number) => void>();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, right: BAR_WIDTH, bottom: 16, width: BAR_WIDTH, height: 16, x: 0, y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("a click lands 10 s before the point clicked", () => {
    render();
    pointer("pointerdown", 50);
    pointer("pointerup", 50);
    expect(onJump).toHaveBeenCalledWith(90);
  });

  it("a click on a caption marker jumps to that marker", () => {
    render();
    pointer("pointerdown", 42); // marker at 82 s is x = 41
    pointer("pointerup", 42);
    expect(onJump).toHaveBeenCalledWith(72);
  });

  it("a drag seeks once, on release, to where the thumb was dropped", () => {
    render();
    pointer("pointerdown", 10);
    pointer("pointermove", 30);
    pointer("pointermove", 41); // passes over the marker without snapping
    expect(onJump).not.toHaveBeenCalled();
    expect(slider().getAttribute("aria-valuetext")).toBe("01:22");
    pointer("pointerup", 41);
    expect(onJump).toHaveBeenCalledTimes(1);
    expect(onJump).toHaveBeenCalledWith(72);
  });

  it("hovering a detected marker shows its reference and confidence", () => {
    render();
    pointer("pointermove", 75);
    expect(container.querySelector('[role="tooltip"]')?.textContent).toContain(
      "Romans 8:28 — 99.1%",
    );
  });

  it("arrows step 5 s, Shift+arrows 30 s", () => {
    render(100);
    key("ArrowRight");
    key("ArrowLeft");
    key("ArrowRight", true);
    key("ArrowLeft", true);
    expect(onJump.mock.calls.map((c) => c[0])).toEqual([105, 95, 130, 70]);
  });

  it("has −10 s, +10 s and +30 s buttons", () => {
    render(100);
    for (const label of ["Back 10 seconds", "Forward 10 seconds", "Forward 30 seconds"]) {
      act(() => container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click());
    }
    expect(onJump.mock.calls.map((c) => c[0])).toEqual([90, 110, 130]);
  });
});

describe("timeline panel arrow keys (SS-075)", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    seekTestFeed.mockClear();
    useTestFeedStore.setState({
      enabled: false,
      status: {
        type: "test_feed", state: "playing", title: "t", source: "s",
        position: 100, start: 0, end: null, speed: 1, duration: 200,
      },
      duration: 200,
      markers: [],
      sourceInfo: null,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<TranscriptTimelinePanel items={[]} onAddManualTranscript={() => {}} />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useTestFeedStore.setState({ status: null, duration: null, markers: [] });
  });

  const press = (target: Element, k: string, shiftKey = false) =>
    act(() => {
      target.dispatchEvent(new KeyboardEvent("keydown", { key: k, shiftKey, bubbles: true }));
    });

  it("seeks a playing feed when the panel has focus", () => {
    const panel = container.firstElementChild!;
    press(panel, "ArrowRight");
    press(panel, "ArrowLeft", true);
    expect(seekTestFeed.mock.calls.map((c) => c[0])).toEqual([105, 70]);
  });

  it("leaves the arrows alone while typing in a field", () => {
    const input = container.querySelector("input")!;
    press(input, "ArrowLeft");
    expect(seekTestFeed).not.toHaveBeenCalled();
  });

  it("does nothing when no feed is playing", () => {
    act(() => useTestFeedStore.setState({ status: null }));
    press(container.firstElementChild!, "ArrowRight");
    expect(seekTestFeed).not.toHaveBeenCalled();
  });
});
