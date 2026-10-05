// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, convertFileSrcMock } = vi.hoisted(() => ({ invokeMock: vi.fn(), convertFileSrcMock: vi.fn((path: string) => `asset://localhost${path}`) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock, convertFileSrc: convertFileSrcMock }));

import { ResilientVideo } from "../ResilientVideo";
import { warmDefaultTemplateVideos } from "../../lib/templateVideoWarmup";
import type { TemplateCanvasTheme } from "../../types/templates";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ResilientVideo playback recovery", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    let blobNumber = 0;
    vi.stubGlobal("URL", Object.assign(URL, {
      createObjectURL: vi.fn(() => `blob:video-${++blobNumber}`),
      revokeObjectURL: vi.fn(),
    }));
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: "video/mp4" }) })));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("streams the prepared file in preview and live without invoking an encoder", async () => {
    const media = { type: "video" as const, src: "/app/video-cache/1d3323d24ccb4bf2.mp4", fit: "cover" as const, loop: true, x: 0, y: 0, width: 100, height: 100, opacity: 1 };
    await act(async () => {
      root.render(<>
        <ResilientVideo media={media} style={{ width: "100%" }} />
        <ResilientVideo media={media} style={{ width: "100%" }} />
      </>);
    });
    expect(container.querySelectorAll("video")).toHaveLength(2);

    expect(invokeMock).not.toHaveBeenCalled();
    expect(convertFileSrcMock).not.toHaveBeenCalled();
    expect([...container.querySelectorAll("video")].every((video) => video.src === "http://127.0.0.1:8000/api/template-video/1d3323d24ccb4bf2.mp4")).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(601);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect([...container.querySelectorAll("video")].every((video) => video.src.startsWith("blob:video-"))).toBe(true);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("reuses a default template video prepared before the first LIVE render", async () => {
    const media = { type: "video" as const, src: "/app/video-cache/aaaaaaaaaaaaaaaa.mp4", fit: "cover" as const, loop: true, x: 0, y: 0, width: 100, height: 100, opacity: 1 };
    warmDefaultTemplateVideos({
      templates: [{ id: "warm-scripture", category: "scriptures", layout: "widescreen", scene: { backgroundMedia: media } } as TemplateCanvasTheme],
      defaults: { scriptures: { widescreen: "warm-scripture", "lower-third": null, "split-screen": null }, songs: { widescreen: null, "lower-third": null, "split-screen": null } },
    });
    const warmed = document.querySelector<HTMLVideoElement>('video[src="http://127.0.0.1:8000/api/template-video/aaaaaaaaaaaaaaaa.mp4"]');
    expect(warmed).not.toBeNull();
    const loadsBeforeLive = vi.mocked(HTMLMediaElement.prototype.load).mock.calls.length;

    await act(async () => root.render(<StrictMode><ResilientVideo media={media} style={{ width: "100%" }} /></StrictMode>));

    expect(container.querySelector("video")).toBe(warmed);
    expect(vi.mocked(HTMLMediaElement.prototype.load).mock.calls.length).toBe(loadsBeforeLive);
  });

  it("keeps streaming when playback advances normally", async () => {
    const media = { type: "video" as const, src: "/app/video-cache/1d3323d24ccb4bf2.mp4", fit: "cover" as const, loop: true, x: 0, y: 0, width: 100, height: 100, opacity: 1 };
    await act(async () => root.render(<ResilientVideo media={media} style={{ width: "100%" }} />));
    const video = container.querySelector("video")!;
    video.currentTime = 1;
    video.dispatchEvent(new Event("timeupdate"));
    await act(async () => vi.advanceTimersByTime(601));
    expect(fetch).not.toHaveBeenCalled();
    expect(video.src).toBe("http://127.0.0.1:8000/api/template-video/1d3323d24ccb4bf2.mp4");
  });

  it("reports readiness only after the video has a decoded frame", async () => {
    const media = { type: "video" as const, src: "/app/video-cache/1d3323d24ccb4bf2.mp4", fit: "cover" as const, loop: true, x: 0, y: 0, width: 100, height: 100, opacity: 1 };
    const onReady = vi.fn();
    await act(async () => root.render(<ResilientVideo media={media} style={{ width: "100%" }} onReady={onReady} />));
    expect(onReady).not.toHaveBeenCalled();
    await act(async () => container.querySelector("video")?.dispatchEvent(new Event("loadeddata")));
    expect(onReady).toHaveBeenCalledOnce();
  });

  it("starts a prepared background after its scene becomes visible", async () => {
    const media = { type: "video" as const, src: "/app/video-cache/cccccccccccccccc.mp4", fit: "cover" as const, loop: true, x: 0, y: 0, width: 100, height: 100, opacity: 1 };
    const onReady = vi.fn();
    await act(async () => root.render(<ResilientVideo media={media} style={{ width: "100%" }} presentationVisible={false} onReady={onReady} />));
    const video = container.querySelector("video");
    expect(video?.autoplay).toBe(false);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();

    await act(async () => video?.dispatchEvent(new Event("loadeddata")));
    expect(onReady).toHaveBeenCalledOnce();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    Object.defineProperty(video, "readyState", { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA });
    await act(async () => vi.advanceTimersByTime(601));
    expect(fetch).not.toHaveBeenCalled();

    await act(async () => root.render(<ResilientVideo media={media} style={{ width: "100%" }} presentationVisible onReady={onReady} />));
    await act(async () => vi.advanceTimersByTime(20));
    expect(container.querySelector("video")).toBe(video);
    expect(video?.autoplay).toBe(true);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(video?.loop).toBe(true);
  });

  it("recovers a stream error with the file fallback without hiding the video", async () => {
    const media = { type: "video" as const, src: "/app/video-cache/1d3323d24ccb4bf2.mp4", fit: "cover" as const, loop: true, x: 0, y: 0, width: 100, height: 100, opacity: 1 };
    await act(async () => root.render(<ResilientVideo media={media} style={{ width: "100%" }} />));
    const video = container.querySelector("video")!;
    await act(async () => {
      video.dispatchEvent(new Event("error"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(video.src).toMatch(/^blob:video-/);
    expect(video.style.display).not.toBe("none");
    expect(container.querySelector("[data-resilient-video-fallback]")).toBeNull();
  });

  it("releases the prepared scene when video and its fallback both fail", async () => {
    const media = { type: "video" as const, src: "/app/video-cache/bbbbbbbbbbbbbbbb.mp4", fit: "cover" as const, loop: true, x: 0, y: 0, width: 100, height: 100, opacity: 1 };
    const onFailure = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Video unavailable"); }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await act(async () => root.render(<ResilientVideo media={media} style={{ width: "100%" }} onFailure={onFailure} />));
    await act(async () => {
      container.querySelector("video")?.dispatchEvent(new Event("error"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onFailure).toHaveBeenCalledOnce();
    expect(container.querySelector("[data-resilient-video-fallback]")).not.toBeNull();
  });

  it("recovers when a video advances to a frame and then stalls", async () => {
    const media = { type: "video" as const, src: "/app/video-cache/1d3323d24ccb4bf2.mp4", fit: "cover" as const, loop: true, x: 0, y: 0, width: 100, height: 100, opacity: 1 };
    await act(async () => root.render(<ResilientVideo media={media} style={{ width: "100%" }} />));
    const video = container.querySelector("video")!;
    video.currentTime = 1;
    video.dispatchEvent(new Event("timeupdate"));
    await act(async () => {
      vi.advanceTimersByTime(3001);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(video.src).toMatch(/^blob:video-/);
  });

  it("retries an unexpected pause but respects the preview pause control", async () => {
    const media = { type: "video" as const, src: "/app/video-cache/1d3323d24ccb4bf2.mp4", fit: "cover" as const, loop: true, x: 0, y: 0, width: 100, height: 100, opacity: 1 };
    await act(async () => root.render(<ResilientVideo media={media} style={{ width: "100%" }} playing />));
    const video = container.querySelector("video")!;
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    const initialCalls = play.mock.calls.length;
    await act(async () => {
      video.dispatchEvent(new Event("pause"));
      vi.advanceTimersByTime(251);
    });
    expect(play.mock.calls.length).toBeGreaterThan(initialCalls);

    await act(async () => root.render(<ResilientVideo media={media} style={{ width: "100%" }} playing={false} />));
    const pausedCalls = play.mock.calls.length;
    await act(async () => {
      video.dispatchEvent(new Event("pause"));
      vi.advanceTimersByTime(251);
    });
    expect(play.mock.calls.length).toBe(pausedCalls);
  });
});
