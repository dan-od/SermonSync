// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CameraFeed } from "../CameraFeed";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("local camera preview pause", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("pauses and resumes its video element without stopping the shared camera track", async () => {
    const stop = vi.fn();
    const track = { stop, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const stream = { active: true, getVideoTracks: () => [track], getTracks: () => [track] };
    const getUserMedia = vi.fn(async () => stream);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia },
      userAgent: "Chrome test browser",
    });
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);

    await act(async () => {
      root.render(<CameraFeed sourceType="local" deviceId="camera-pause-test" />);
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalled();
    const video = container.querySelector("video");
    expect(video?.srcObject).toBe(stream);

    await act(async () => {
      root.render(<CameraFeed sourceType="local" deviceId="camera-pause-test" paused />);
    });
    expect(pause).toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
    expect(video?.srcObject).toBe(stream);

    const playCallsBeforeResume = play.mock.calls.length;
    await act(async () => {
      root.render(<CameraFeed sourceType="local" deviceId="camera-pause-test" paused={false} />);
    });
    expect(play.mock.calls.length).toBeGreaterThan(playCallsBeforeResume);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("reports an unconfigured camera so a projector handoff can finish", () => {
    const onError = vi.fn();
    act(() => root.render(<CameraFeed sourceType="local" onError={onError} />));
    expect(onError).toHaveBeenCalledWith("No camera device was selected.");
  });

  it("never enters WebKitGTK browser capture after a native camera error", async () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15",
      mediaDevices: { getUserMedia },
    });

    await act(async () => {
      root.render(<CameraFeed sourceType="local" deviceId="/dev/video3" cameraLabel="Integrated Webcam_HD" />);
    });
    const image = container.querySelector("img");
    expect(image?.getAttribute("src")).toContain("device=%2Fdev%2Fvideo3");
    await act(async () => { image?.dispatchEvent(new Event("error")); });

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(container.textContent).toContain("The camera feed stopped");
  });

  it("freezes a native camera with a single JPEG snapshot when paused", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15",
      mediaDevices: { getUserMedia: vi.fn() },
    });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
    vi.stubGlobal("cancelAnimationFrame", (timer: number) => window.clearTimeout(timer));

    await act(async () => { root.render(<CameraFeed sourceType="local" deviceId="/dev/video3" cameraLabel="Integrated Webcam_HD" />); });
    await act(async () => { root.render(<CameraFeed sourceType="local" deviceId="/dev/video3" cameraLabel="Integrated Webcam_HD" paused />); });
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 10)); });

    expect(container.querySelector<HTMLImageElement>('img[alt="Paused camera preview"]')?.src).toContain("/api/camera/frame?");
  });
});
