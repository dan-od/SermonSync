// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { getSharedAudioElement, getSharedAudioOwner, pauseSharedAudioPlayback, startSharedAudioPlayback } from "../audioPlayback";

describe("shared audio playback", () => {
  afterEach(() => vi.restoreAllMocks());

  it("starts the selected track synchronously with its configured trim and volume", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const audio = getSharedAudioElement();
    const activation = startSharedAudioPlayback("asset://audio-click-test.mp3", {
      volume: 0.6,
      trimStart: 3,
      trimEnd: 12,
      loop: false,
    });

    expect(play).toHaveBeenCalledOnce();
    expect(audio.src).toBe("asset://audio-click-test.mp3");
    expect(document.body.contains(audio)).toBe(true);
    expect(audio.volume).toBe(0.6);
    expect(audio.muted).toBe(false);
    await activation;
  });

  it("keeps Live playing when Preview is suspended", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const settings = { volume: 1, trimStart: 0, trimEnd: null, loop: false };
    await startSharedAudioPlayback("http://127.0.0.1:8000/preview.mp3", settings, "preview");
    await startSharedAudioPlayback("http://127.0.0.1:8000/live.mp3", settings, "live");
    pause.mockClear();

    pauseSharedAudioPlayback("preview");
    expect(getSharedAudioOwner()).toBe("live");
    expect(getSharedAudioElement().src).toBe("http://127.0.0.1:8000/live.mp3");
    expect(pause).not.toHaveBeenCalled();
    pauseSharedAudioPlayback("live");
  });

  it("ignores completion from a track replaced before play resolves", async () => {
    let finishOld!: () => void;
    const play = vi.spyOn(HTMLMediaElement.prototype, "play")
      .mockImplementationOnce(() => new Promise<void>((resolve) => { finishOld = resolve; }))
      .mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const settings = { volume: 1, trimStart: 0, trimEnd: null, loop: false };
    const oldRequest = startSharedAudioPlayback("http://127.0.0.1:8000/old.mp3", settings, "live");
    const newRequest = startSharedAudioPlayback("http://127.0.0.1:8000/new.mp3", settings, "live");
    finishOld();
    expect(await oldRequest).toBe(false);
    expect(await newRequest).toBe(true);
    expect(play).toHaveBeenCalledTimes(2);
    pauseSharedAudioPlayback("live");
  });
});
