// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { useAudioPeaks } from "../waveform";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function WaveformResult({ src, buckets, sourcePath }: { src: string; buckets: number; sourcePath?: string }) {
  const result = useAudioPeaks(src, buckets, sourcePath);
  return <output data-testid={`waveform-${buckets}`} data-count={result.peaks.length} data-duration={result.duration} data-low={Math.min(...result.minPeaks)} data-high={Math.max(...result.maxPeaks)} />;
}

describe("useAudioPeaks", () => {
  let container: HTMLDivElement;
  let root: Root;
  let decodeAudioData: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const samples = new Float32Array(4096);
    samples[200] = 0.9;
    samples[300] = -0.7;
    const buffer = { duration: 2, getChannelData: () => samples };
    decodeAudioData = vi.fn((_data: ArrayBuffer, resolve: (decoded: typeof buffer) => void) => resolve(buffer));
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: class {
        decodeAudioData = decodeAudioData;
      },
    });
    fetchMock = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("shares one source decode between concurrent waveform consumers", async () => {
    const src = "asset://audio-cache-test.mp3";
    await act(async () => root.render(<>
      <WaveformResult src={src} buckets={64} />
      <WaveformResult src={src} buckets={220} />
    </>));

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="waveform-64"]')?.getAttribute("data-count")).toBe("64");
      expect(container.querySelector('[data-testid="waveform-220"]')?.getAttribute("data-count")).toBe("220");
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(decodeAudioData).toHaveBeenCalledTimes(1);
    expect(Number(container.querySelector('[data-testid="waveform-64"]')?.getAttribute("data-low"))).toBeCloseTo(-0.7);
    expect(Number(container.querySelector('[data-testid="waveform-64"]')?.getAttribute("data-high"))).toBeCloseTo(0.9);
  });

  it("uses bounded native waveform generation for desktop audio", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    invokeMock.mockResolvedValue({ peaks: Array(512).fill(0.5), minPeaks: [-0.8, -0.1], maxPeaks: [0.3, 0.7], duration: 1123 });
    await act(async () => root.render(<WaveformResult src="http://127.0.0.1:8000/api/media-audio/test/playback.mp3" sourcePath="/managed/long.mp3" buckets={220} />));
    await vi.waitFor(() => {
      expect(container.querySelector("output")?.getAttribute("data-count")).toBe("220");
      expect(container.querySelector("output")?.getAttribute("data-duration")).toBe("1123");
    });
    expect(invokeMock).toHaveBeenCalledWith("get_audio_waveform", { path: "/managed/long.mp3" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector("output")?.getAttribute("data-low")).toBe("-0.8");
  });
});
