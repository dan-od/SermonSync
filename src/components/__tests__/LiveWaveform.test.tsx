// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LiveWaveform } from "../Media/LiveWaveform";
import { liveWaveformWindow } from "../../lib/liveWaveform";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("LiveWaveform", () => {
  const fillRect = vi.fn();
  const observeSpy = vi.fn();
  const disconnectSpy = vi.fn();
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class { observe = observeSpy; disconnect = disconnectSpy; });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      setTransform: vi.fn(), clearRect: vi.fn(), fillRect,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(600);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    fillRect.mockClear();
    observeSpy.mockClear();
    disconnectSpy.mockClear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps short audio in view and scrolls a long track with its playhead", () => {
    expect(liveWaveformWindow(1.3, 0.8)).toEqual({ start: 0, end: 1.3 });
    expect(liveWaveformWindow(1123, 60)).toEqual({ start: 55.8, end: 67.8 });
    expect(liveWaveformWindow(1123, 1122)).toEqual({ start: 1111, end: 1123 });
  });

  it("draws signed peaks across the zero line", () => {
    act(() => root.render(<LiveWaveform minPeaks={[-0.6]} maxPeaks={[0.8]} duration={1} currentTime={0.5} playing={false} />));
    const bars = fillRect.mock.calls.filter((call) => call[2] > 2 && call[3] > 2);
    expect(bars).toHaveLength(1);
    expect(bars[0][1]).toBeLessThan(90);
    expect(bars[0][1] + bars[0][3]).toBeGreaterThan(90);
  });

  it("keeps the canvas observer while playback progress changes", () => {
    const props = { minPeaks: [-0.6], maxPeaks: [0.8], duration: 10, playing: false };
    act(() => root.render(<LiveWaveform {...props} currentTime={1} />));
    const initialDraws = fillRect.mock.calls.length;
    act(() => root.render(<LiveWaveform {...props} currentTime={2} />));

    expect(observeSpy).toHaveBeenCalledTimes(1);
    expect(disconnectSpy).not.toHaveBeenCalled();
    expect(fillRect.mock.calls.length).toBeGreaterThan(initialDraws);
  });
});
