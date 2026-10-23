// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { defaults, videoElementCallbacks, readyCallbacks, flags, audioPeaksMock, setLiveAudioWaveformMock, setLiveAudioPlaybackErrorMock } = vi.hoisted(() => ({
  defaults: {
    scriptures: { widescreen: "scripture-video" as string | null, "lower-third": "scripture-lower-video" as string | null, "split-screen": "scripture-split-video" as string | null },
    songs: { widescreen: "song-video" as string | null, "lower-third": null as string | null, "split-screen": null as string | null },
  },
  videoElementCallbacks: vi.fn(),
  readyCallbacks: new Map<string, () => void>(),
  flags: { sharedBackground: false, liveAudioActive: false },
  audioPeaksMock: vi.fn(() => ({ peaks: [0.2, 0.8, 0.4], minPeaks: [-0.2, -0.7, -0.3], maxPeaks: [0.2, 0.8, 0.4], duration: 10, loading: false, error: null })),
  setLiveAudioWaveformMock: vi.fn(),
  setLiveAudioPlaybackErrorMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (path: string) => `asset://localhost${path}` }));
vi.mock("../../lib/waveform", () => ({ useAudioPeaks: audioPeaksMock }));
vi.mock("../Media/Waveform", () => ({ WaveformCanvas: ({ currentTime, onSeek }: { currentTime?: number; onSeek?: (time: number) => void }) => <button type="button" data-testid="audio-waveform" data-current-time={currentTime} onClick={() => onSeek?.(4)}>Waveform</button> }));
vi.mock("../Media/LiveWaveform", () => ({ LiveWaveform: ({ currentTime, onSeek, minPeaks, maxPeaks }: { currentTime?: number; onSeek?: (time: number) => void; minPeaks: number[]; maxPeaks: number[] }) => <button type="button" data-testid="audio-waveform" data-current-time={currentTime} data-min={minPeaks.join(",")} data-max={maxPeaks.join(",")} onClick={() => onSeek?.(4)}>Live waveform</button> }));
vi.mock("../../lib/projectionScene", () => ({
  projectionScene: (template: { id: string }) => ({
    canvasWidth: 1920,
    canvasHeight: 1080,
    layers: [{ id: "caption", type: "text", content: template.id.startsWith("song") ? "{song_lines}" : "{scripture_text}", visible: true, x: 10, y: 10, width: 80, height: 80, opacity: 1, rotation: 0, zIndex: 1, fontSize: 48, lineHeight: 1.2, autoFit: "none" }],
    backgroundMedia: template.id === "song-image"
      ? { type: "image", src: "song.jpg", fit: "cover", x: 0, y: 0, width: 100, height: 100, opacity: 1 }
      : template.id.endsWith("video")
      ? { type: "video", src: flags.sharedBackground ? "shared.mp4" : `${template.id}.mp4`, fit: "cover", x: 0, y: 0, width: 100, height: 100, opacity: 1 }
      : template.id === "scripture-camera" || template.id === "scripture-lower-camera"
        ? { type: "camera", src: "", fit: "cover", x: 0, y: 0, width: 100, height: 100, opacity: 1 }
        : null,
  }),
}));
vi.mock("../../stores/templateStore", () => ({
  useTemplateStore: (selector: (state: unknown) => unknown) => selector({
    templates: [
      { id: "scripture-video", category: "scriptures", layout: "widescreen" },
      { id: "scripture-lower-video", category: "scriptures", layout: "lower-third" },
      { id: "scripture-split-video", category: "scriptures", layout: "split-screen" },
      { id: "song-video", category: "songs", layout: "widescreen" },
      { id: "song-image", category: "songs", layout: "widescreen" },
      { id: "scripture-camera", category: "scriptures", layout: "widescreen" },
      { id: "scripture-lower-camera", category: "scriptures", layout: "lower-third" },
      { id: "song-empty", category: "songs", layout: "widescreen" },
    ],
    defaults,
    initialized: true,
  }),
}));
vi.mock("../../stores/projectorStore", () => {
  const state = { logo: { src: null, fit: "contain" }, transitions: {} };
  const useProjectorStore = Object.assign(
    (selector: (value: typeof state & { feedOverride: string; liveMedia: { category: string } | null; livePlayback: { playing: boolean } }) => unknown) => selector({ ...state, feedOverride: flags.liveAudioActive ? "live" : "black", liveMedia: flags.liveAudioActive ? { category: "audio" } : null, livePlayback: { playing: flags.liveAudioActive } }),
    { getState: () => ({ setLiveAudioWaveform: setLiveAudioWaveformMock, setLiveAudioPlaybackError: setLiveAudioPlaybackErrorMock }) },
  );
  return { useProjectorStore };
});
vi.mock("../CameraFeed", () => ({ CameraFeed: ({ onError }: { onError?: (message: string) => void }) => <button type="button" data-testid="camera-feed" onClick={() => onError?.("Camera offline")}>Camera feed</button> }));
vi.mock("../ResilientVideo", () => ({
  ResilientVideo: ({ media, playing, loop, onVideoElementChange, onReady, presentationVisible = true }: { media: { src: string }; playing?: boolean; loop?: boolean; onVideoElementChange?: (video: HTMLVideoElement | null) => void; onReady?: () => void; presentationVisible?: boolean }) => {
    videoElementCallbacks(onVideoElementChange);
    useEffect(() => {
      if (onReady) readyCallbacks.set(media.src, onReady);
      return () => { if (readyCallbacks.get(media.src) === onReady) readyCallbacks.delete(media.src); };
    }, [media.src, onReady]);
    return <div data-testid="background-video" data-src={media.src} data-playing={String(playing)} data-loop={String(loop)} data-visible={String(presentationVisible)} />;
  },
}));

import { ProjectorView } from "../ProjectorView";
import { getSharedAudioElement } from "../../lib/audioPlayback";
import { createOverlayDraft, createOverlayShape } from "../../types/overlays";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("live screen playback controls", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    defaults.scriptures.widescreen = "scripture-video";
    defaults.scriptures["lower-third"] = "scripture-lower-video";
    defaults.scriptures["split-screen"] = "scripture-split-video";
    defaults.songs.widescreen = "song-video";
    flags.sharedBackground = false;
    flags.liveAudioActive = false;
    readyCallbacks.clear();
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    videoElementCallbacks.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  for (const category of ["scriptures", "songs"] as const) {
    it(`plays and loops a ${category} template video from the LIVE card`, () => {
      const slide = category === "songs"
        ? { reference: { book: "Song", chapter: 1, verse: 1 }, text: "Lyrics", version: "SONG" }
        : { reference: { book: "John", chapter: 3, verse: 16 }, text: "Verse", version: "KJV" };
      act(() => root.render(<ProjectorView title="LIVE" slide={slide} feedOverride="live" overlayMode="widescreen" theme="cross" isLive fontSizePx={48} />));

      const pause = container.querySelector<HTMLButtonElement>('button[aria-label="Pause LIVE video"]');
      const loop = container.querySelector<HTMLButtonElement>('button[aria-label="Disable loop for LIVE video"]');
      expect(pause?.disabled).toBe(false);
      expect(loop?.disabled).toBe(false);
      expect(container.querySelector('[data-testid="background-video"]')?.getAttribute("data-playing")).toBe("true");

      act(() => pause?.click());
      act(() => loop?.click());
      expect(container.querySelector('[data-testid="background-video"]')?.getAttribute("data-playing")).toBe("false");
      expect(container.querySelector('[data-testid="background-video"]')?.getAttribute("data-loop")).toBe("false");
    });
  }

  it("lets the LIVE card pause a video sent directly from the library", () => {
    const media = { path: "/video.mp4", name: "Video", category: "videos" as const, fit: "cover" as const, opacity: 1 };
    act(() => root.render(<ProjectorView title="LIVE" slide={null} media={media} feedOverride="live" overlayMode="widescreen" theme="cross" isLive fontSizePx={48} />));

    const pause = container.querySelector<HTMLButtonElement>('button[aria-label="Pause LIVE video"]');
    expect(pause?.disabled).toBe(false);
    act(() => pause?.click());
    expect(container.querySelector('[data-testid="background-video"]')?.getAttribute("data-playing")).toBe("false");
  });

  it("keeps the current slide visible while a different media type prepares", () => {
    const slide = { reference: { book: "John", chapter: 3, verse: 16 }, text: "Current verse", version: "KJV" };
    act(() => root.render(<ProjectorView title="LIVE" slide={slide} feedOverride="live" overlayMode="widescreen" theme="cross" isLive fontSizePx={48} />));
    act(() => readyCallbacks.get("scripture-video.mp4")?.());
    const outgoingScene = container.querySelector('[data-projector-scene="visible"]');
    expect(outgoingScene?.textContent).toContain("Current verse");

    act(() => root.render(<ProjectorView title="LIVE" slide={null} media={{ path: "/video.mp4", name: "Video", category: "videos", fit: "cover", opacity: 1 }} feedOverride="live" overlayMode="widescreen" theme="cross" isLive fontSizePx={48} />));

    expect(outgoingScene?.isConnected).toBe(true);
    expect(container.querySelector('[data-projector-media-layer="preparing"]')).not.toBeNull();
    act(() => readyCallbacks.get("asset://localhost/video.mp4")?.());
    expect(container.querySelector('[data-projector-media-layer="visible"]')).not.toBeNull();
  });

  it("keeps the current media visible while a song scene prepares", () => {
    const media = { path: "/video.mp4", name: "Video", category: "videos" as const, fit: "cover" as const, opacity: 1 };
    act(() => root.render(<ProjectorView title="LIVE" slide={null} media={media} feedOverride="live" overlayMode="widescreen" theme="cross" isLive fontSizePx={48} />));
    act(() => readyCallbacks.get("asset://localhost/video.mp4")?.());
    const outgoingMedia = container.querySelector('[data-projector-media-layer="visible"]');
    expect(outgoingMedia).not.toBeNull();

    const song = { reference: { book: "Song", chapter: 1, verse: 1 }, text: "New song lyrics", version: "SONG" };
    act(() => root.render(<ProjectorView title="LIVE" slide={song} media={null} feedOverride="live" overlayMode="widescreen" theme="cross" isLive fontSizePx={48} />));

    expect(outgoingMedia?.isConnected).toBe(true);
    expect(outgoingMedia?.querySelector('[data-testid="background-video"]')?.getAttribute("data-playing")).toBe("false");
    expect(container.querySelector('[data-projector-scene="preparing"]')?.textContent).not.toContain("New song lyrics");
    act(() => readyCallbacks.get("song-video.mp4")?.());
    expect(container.querySelector('[data-projector-scene="visible"]')?.textContent).toContain("New song lyrics");
  });

  it("plays projected audio with a synchronized waveform and mutes the external output", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    audioPeaksMock.mockClear();
    setLiveAudioWaveformMock.mockClear();
    const media = {
      path: "/audio.mp3",
      name: "Choir intro",
      category: "audio" as const,
      fit: "cover" as const,
      opacity: 1,
      audioSettings: { volume: 0.4, trimStart: 2, trimEnd: 8 },
    };
    const playback = { playing: true, looping: false, seekTime: null, seekRevision: 0 };
    const onSeek = vi.fn();

    await act(async () => root.render(<>
      <ProjectorView title="LIVE" slide={null} media={media} feedOverride="live" overlayMode="widescreen" theme="cross" isLive fontSizePx={48} playback={playback} onPlaybackChange={vi.fn()} onSeek={onSeek} />
      <ProjectorView title="PROJECTOR OUTPUT" slide={null} media={media} feedOverride="live" overlayMode="widescreen" theme="cross" isLive fontSizePx={48} chrome={false} playback={playback} />
    </>));

    const audioElements = [...container.querySelectorAll("audio")];
    const operatorAudio = getSharedAudioElement();
    expect(audioElements).toHaveLength(0);
    expect(operatorAudio.src).toBe("asset://localhost/audio.mp3");
    expect(operatorAudio.volume).toBe(0.4);
    expect(operatorAudio.muted).toBe(false);
    expect(play).toHaveBeenCalled();
    expect(container.querySelectorAll('[data-projector-audio=""]')).toHaveLength(2);
    expect(audioPeaksMock).toHaveBeenCalledWith("asset://localhost/audio.mp3", 220, "/audio.mp3");
    expect(audioPeaksMock).toHaveBeenCalledWith(null, 220, "/audio.mp3");
    expect(setLiveAudioWaveformMock).toHaveBeenCalledWith("/audio.mp3", [0.2, 0.8, 0.4], 10, null, [-0.2, -0.7, -0.3], [0.2, 0.8, 0.4]);
    expect(container.querySelector('[data-testid="audio-waveform"]')?.getAttribute("data-min")).toBe("-0.2,-0.7,-0.3");

    Object.defineProperty(operatorAudio, "duration", { configurable: true, value: 10 });
    await act(async () => operatorAudio.dispatchEvent(new Event("loadedmetadata")));
    Object.defineProperty(operatorAudio, "currentTime", { configurable: true, writable: true, value: 3 });
    await act(async () => operatorAudio.dispatchEvent(new Event("timeupdate")));
    expect(container.querySelector<HTMLInputElement>('input[aria-label="LIVE audio progress"]')?.max).toBe("10");
    const renderedPlayheads = [...container.querySelectorAll('[data-testid="audio-waveform"]')].map((waveform) => waveform.getAttribute("data-current-time"));
    expect(renderedPlayheads).toContain("3");

    await act(async () => (container.querySelector<HTMLButtonElement>('[data-testid="audio-waveform"]') as HTMLButtonElement).click());
    expect(operatorAudio.currentTime).toBe(4);
    expect(onSeek).toHaveBeenCalledWith(4);
  });

  it("shows a playback rejection instead of silently remaining at zero", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new Error("NotAllowedError: playback was blocked"));
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    setLiveAudioPlaybackErrorMock.mockClear();
    const media = { path: "/audio.mp3", name: "Choir intro", category: "audio" as const, fit: "cover" as const, opacity: 1 };

    await act(async () => root.render(<ProjectorView title="LIVE" slide={null} media={media} feedOverride="live" overlayMode="widescreen" theme="cross" isLive fontSizePx={48} playback={{ playing: true, looping: false, seekTime: null, seekRevision: 0 }} onPlaybackChange={vi.fn()} />));

    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain("NotAllowedError"));
    expect(setLiveAudioPlaybackErrorMock).toHaveBeenCalledWith("/audio.mp3", expect.stringContaining("NotAllowedError: playback was blocked"));
  });

  it("renders output audio progress without an output audio element", async () => {
    const media = { path: "/audio.mp3", name: "Choir", category: "audio" as const, fit: "cover" as const, opacity: 1, audioWaveform: [0.2, 0.8], audioDuration: 12 };
    await act(async () => root.render(<ProjectorView title="PROJECTOR OUTPUT" slide={null} media={media} feedOverride="live" overlayMode="widescreen" theme="cross" isLive fontSizePx={48} chrome={false} audioProgress={{ path: media.path, time: 5, duration: 12 }} />));
    expect(container.querySelectorAll("audio")).toHaveLength(0);
    expect(container.querySelector('[data-testid="audio-waveform"]')?.getAttribute("data-current-time")).toBe("5");
  });

  it("does not let Preview playback controls interrupt Live audio", async () => {
    flags.liveAudioActive = true;
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const media = { path: "/preview.mp3", name: "Preview", category: "audio" as const, fit: "cover" as const, opacity: 1 };
    await act(async () => root.render(<ProjectorView title="PREVIEW" slide={null} media={media} feedOverride="live" overlayMode="widescreen" theme="cross" isLive={false} fontSizePx={48} />));
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Play PREVIEW audio"]')?.disabled).toBe(true);
    expect(play).not.toHaveBeenCalled();
  });

  it("clears a projected image and restores it when Clear is toggled off", () => {
    const media = { path: "/photo.png", name: "Photo", category: "images" as const, fit: "cover" as const, opacity: 1 };
    const render = (feedOverride: "live" | "clear") => root.render(
      <ProjectorView title="PROJECTOR OUTPUT" slide={null} media={media} feedOverride={feedOverride} overlayMode="widescreen" theme="cross" isLive fontSizePx={48} chrome={false} />,
    );

    act(() => render("live"));
    const image = container.querySelector('img[alt="Photo"]');
    const mediaLayer = container.querySelector<HTMLElement>("[data-projector-media]");
    expect(mediaLayer?.style.opacity).toBe("1");

    act(() => render("clear"));
    expect(container.querySelector("[data-projector-media]")).toBe(mediaLayer);
    expect(container.querySelector<HTMLElement>("[data-projector-media]")?.style.opacity).toBe("0");
    expect(container.querySelector<HTMLElement>("[data-projector-media]")?.style.transition).toBe("none");
    expect(container.querySelector('img[alt="Photo"]')).toBe(image);

    act(() => render("live"));
    expect(container.querySelector<HTMLElement>("[data-projector-media]")?.style.opacity).toBe("1");
  });

  it("does not remount live content when a feed override is toggled", () => {
    defaults.scriptures.widescreen = null;
    const slide = { reference: { book: "John", chapter: 3, verse: 16 }, text: "For God so loved the world", version: "KJV" };
    const render = (feedOverride: "live" | "black") => root.render(
      <ProjectorView title="PROJECTOR OUTPUT" slide={slide} feedOverride={feedOverride} overlayMode="widescreen" theme="cross" isLive fontSizePx={48} chrome={false} />,
    );

    act(() => render("live"));
    const transitionLayer = container.querySelector("[data-projector-template-fallback]")?.parentElement;
    expect(transitionLayer).toBeDefined();

    act(() => render("black"));
    expect(transitionLayer?.isConnected).toBe(true);

    act(() => render("live"));
    expect(container.querySelector("[data-projector-template-fallback]")?.parentElement).toBe(transitionLayer);
  });

  it("clears a projected video without restarting its player", () => {
    const media = { path: "/video.mp4", name: "Video", category: "videos" as const, fit: "cover" as const, opacity: 1 };
    const render = (feedOverride: "live" | "clear") => root.render(
      <ProjectorView title="PROJECTOR OUTPUT" slide={null} media={media} feedOverride={feedOverride} overlayMode="widescreen" theme="cross" isLive fontSizePx={48} chrome={false} />,
    );

    act(() => render("live"));
    const video = container.querySelector('[data-testid="background-video"]');
    act(() => render("clear"));
    expect(container.querySelector('[data-testid="background-video"]')).toBe(video);
    expect(container.querySelector<HTMLElement>("[data-projector-media]")?.style.opacity).toBe("0");
    act(() => render("live"));
    expect(container.querySelector('[data-testid="background-video"]')).toBe(video);
    expect(container.querySelector<HTMLElement>("[data-projector-media]")?.style.opacity).toBe("1");
  });

  it("preserves configured transitions on black and logo overrides", () => {
    const slide = { reference: { book: "John", chapter: 3, verse: 16 }, text: "For God so loved the world", version: "KJV" };
    const render = (feedOverride: "live" | "black" | "logo") => root.render(
      <ProjectorView title="PROJECTOR OUTPUT" slide={slide} feedOverride={feedOverride} overlayMode="widescreen" theme="cross" isLive fontSizePx={48} chrome={false} />,
    );

    act(() => render("live"));
    act(() => render("black"));
    expect(container.querySelector<HTMLElement>('[aria-label="Black live feed overlay"]')?.style.transition).toBe("none");
    expect(container.querySelector<HTMLElement>('[aria-label="Black live feed overlay"]')?.style.opacity).toBe("1");

    act(() => render("logo"));
    expect(container.querySelector<HTMLElement>('[aria-label="Logo live feed overlay"]')?.style.transition).toBe("none");
    expect(container.querySelector<HTMLElement>('[aria-label="Logo live feed overlay"]')?.style.opacity).toBe("1");
  });

  it("shows a live overlay above an empty screen and hides it with Clear", () => {
    const shape = createOverlayShape("rectangle");
    const overlay = { ...createOverlayDraft("alert"), message: "Please stand", shapes: [shape], elements: undefined };
    const overlays = [{ definition: overlay, startedAt: Date.now() }];
    const render = (feedOverride: "live" | "clear") => root.render(
      <ProjectorView title="PROJECTOR OUTPUT" slide={null} overlays={overlays} feedOverride={feedOverride} overlayMode="widescreen" theme="cross" isLive fontSizePx={48} chrome={false} />,
    );

    act(() => render("live"));
    expect(container.querySelector("[data-projector-overlays]")?.textContent).toContain("Please stand");
    expect(container.querySelector(`[data-overlay-shape-id="${shape.id}"]`)).not.toBeNull();
    const visual = container.querySelector(`[data-overlay-id="${overlay.id}"]`);
    act(() => render("clear"));
    expect(container.querySelector(`[data-overlay-id="${overlay.id}"]`)).toBe(visual);
    expect(container.querySelector<HTMLElement>("[data-projector-overlays]")?.style.opacity).toBe("0");
    act(() => render("live"));
    expect(container.querySelector<HTMLElement>("[data-projector-overlays]")?.style.opacity).toBe("1");
  });

  it("renders only the newest overlay if a stale state contains two", () => {
    const first = { ...createOverlayDraft("timer"), id: "timer-a" };
    const second = { ...createOverlayDraft("alert"), id: "alert-b" };
    const overlays = [
      { definition: first, startedAt: Date.now() },
      { definition: second, startedAt: Date.now() },
    ];
    act(() => root.render(<ProjectorView title="PROJECTOR OUTPUT" slide={null} overlays={overlays} feedOverride="live" overlayMode="widescreen" theme="cross" isLive fontSizePx={48} chrome={false} />));
    expect(container.querySelector(`[data-overlay-id="${first.id}"]`)).toBeNull();
    expect(container.querySelector(`[data-overlay-id="${second.id}"]`)).not.toBeNull();
    expect(container.querySelector("[data-projector-overlays]")?.textContent).toContain("Quick alert");
    expect(container.querySelector("[data-projector-overlays]")?.textContent).not.toContain("05:00");
  });

  it("reflects shared playback changes on the LIVE card and projector output", () => {
    const slide = { reference: { book: "John", chapter: 3, verse: 16 }, text: "Verse", version: "KJV" };
    let playback = { playing: true, looping: true, seekTime: null, seekRevision: 0 };
    const change = vi.fn((patch: Partial<typeof playback>) => {
      playback = { ...playback, ...patch };
    });
    const render = () => root.render(<>
      <ProjectorView title="LIVE" slide={slide} feedOverride="live" overlayMode="widescreen" theme="cross" isLive fontSizePx={48} playback={playback} onPlaybackChange={change} />
      <ProjectorView title="PROJECTOR OUTPUT" slide={slide} feedOverride="live" overlayMode="widescreen" theme="cross" isLive fontSizePx={48} chrome={false} playback={playback} />
    </>);

    act(render);
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Pause LIVE video"]')?.click());
    expect(change).toHaveBeenCalledWith({ playing: false });
    act(render);
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Play LIVE video"]')).not.toBeNull();
    expect([...container.querySelectorAll('[data-testid="background-video"]')].every((video) => video.getAttribute("data-playing") === "false")).toBe(true);

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Disable loop for LIVE video"]')?.click());
    expect(change).toHaveBeenCalledWith({ looping: false });
    act(render);
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Enable loop for LIVE video"]')).not.toBeNull();
    expect([...container.querySelectorAll('[data-testid="background-video"]')].every((video) => video.getAttribute("data-loop") === "false")).toBe(true);
  });

  it("applies a LIVE seek command to the output video", () => {
    const slide = { reference: { book: "John", chapter: 3, verse: 16 }, text: "Verse", version: "KJV" };
    const playback = { playing: true, looping: true, seekTime: null as number | null, seekRevision: 0 };
    act(() => root.render(<ProjectorView title="PROJECTOR OUTPUT" slide={slide} feedOverride="live" overlayMode="widescreen" theme="cross" isLive fontSizePx={48} chrome={false} playback={playback} />));
    const onVideoElementChange = videoElementCallbacks.mock.lastCall?.[0] as ((video: HTMLVideoElement | null) => void) | undefined;
    const video = document.createElement("video");
    act(() => onVideoElementChange?.(video));

    act(() => root.render(<ProjectorView title="PROJECTOR OUTPUT" slide={slide} feedOverride="live" overlayMode="widescreen" theme="cross" isLive fontSizePx={48} chrome={false} playback={{ ...playback, seekTime: 12.5, seekRevision: 1 }} />));
    expect(video.currentTime).toBe(12.5);
  });

  it("keeps camera behavior on the template that contains the camera", () => {
    defaults.scriptures.widescreen = "scripture-camera";
    defaults.songs.widescreen = "song-empty";
    const scripture = { reference: { book: "John", chapter: 3, verse: 16 }, text: "Verse", version: "KJV" };
    const song = { reference: { book: "Song", chapter: 1, verse: 1 }, text: "Lyrics", version: "SONG" };

    act(() => root.render(<ProjectorView title="LIVE" slide={scripture} feedOverride="live" overlayMode="widescreen" theme="cross" isLive fontSizePx={48} />));
    expect(container.querySelector('[data-testid="camera-feed"]')).not.toBeNull();
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Pause LIVE video"]')?.disabled).toBe(true);

    act(() => root.render(<ProjectorView title="LIVE" slide={song} feedOverride="live" overlayMode="widescreen" theme="cross" isLive fontSizePx={48} />));
    expect(container.querySelector('[data-testid="camera-feed"]')).toBeNull();
    expect(container.querySelector('[data-testid="background-video"]')).toBeNull();
  });

  it("keeps outgoing scripture until the song background is ready, then cuts directly", () => {
    const scripture = { reference: { book: "John", chapter: 3, verse: 16 }, text: "Verse", version: "KJV" };
    const song = { reference: { book: "Song", chapter: 1, verse: 1 }, text: "Lyrics", version: "SONG" };
    const render = (slide: typeof scripture) => root.render(<ProjectorView title="LIVE" slide={slide} feedOverride="live" overlayMode="widescreen" theme="cross" isLive fontSizePx={48} />);

    act(() => render(scripture));
    expect(container.querySelector('[data-projector-scene="visible"]')).toBeNull();
    expect(container.querySelector('[data-projector-scene="preparing"]')?.textContent).not.toContain("Verse");
    expect(container.querySelector('[data-projector-scene="preparing"] [data-testid="background-video"]')?.getAttribute("data-visible")).toBe("false");
    act(() => readyCallbacks.get("scripture-video.mp4")?.());
    expect(container.querySelector('[data-projector-scene="visible"]')?.textContent).toContain("Verse");
    expect(container.querySelector('[data-projector-scene="visible"] [data-testid="background-video"]')?.getAttribute("data-visible")).toBe("true");

    act(() => render(song));
    expect(container.querySelector('[data-projector-scene="visible"]')?.textContent).toContain("Verse");
    expect(container.querySelector('[data-projector-scene="preparing"]')?.textContent).not.toContain("Lyrics");
    expect(container.querySelector<HTMLElement>('[data-projector-scene="preparing"]')?.style.opacity).toBe("0.001");

    act(() => readyCallbacks.get("song-video.mp4")?.());
    expect(container.querySelector('[data-projector-scene="visible"]')?.textContent).toContain("Lyrics");
    expect(container.querySelector('[data-projector-scene="outgoing"]')).toBeNull();
  });

  it("reuses the playing background when song and scripture share its source", () => {
    flags.sharedBackground = true;
    const scripture = { reference: { book: "John", chapter: 3, verse: 16 }, text: "Verse", version: "KJV" };
    const song = { reference: { book: "Song", chapter: 1, verse: 1 }, text: "Lyrics", version: "SONG" };
    const render = (slide: typeof scripture) => root.render(<ProjectorView title="LIVE" slide={slide} feedOverride="live" overlayMode="widescreen" theme="cross" isLive fontSizePx={48} />);

    act(() => render(scripture));
    act(() => readyCallbacks.get("shared.mp4")?.());
    const video = container.querySelector('[data-testid="background-video"]');
    act(() => render(song));
    expect(container.querySelector('[data-projector-scene="visible"]')?.textContent).toContain("Lyrics");
    expect(container.querySelector('[data-projector-scene="preparing"]')).toBeNull();
    expect(container.querySelector('[data-testid="background-video"]')).toBe(video);
  });

  it("keeps the same scripture scene mounted across a routine output update", () => {
    const slide = { reference: { book: "John", chapter: 3, verse: 16 }, text: "Verse", version: "KJV" };
    const render = (nextSlide: typeof slide, playing: boolean) => root.render(
      <ProjectorView title="PROJECTOR OUTPUT" slide={nextSlide} feedOverride="live" overlayMode="widescreen" theme="cross" isLive fontSizePx={48} chrome={false} playback={{ playing, looping: true, seekTime: null, seekRevision: 0 }} />,
    );

    act(() => render(slide, true));
    act(() => readyCallbacks.get("scripture-video.mp4")?.());
    const scene = container.querySelector('[data-projector-scene="visible"]');
    const video = scene?.querySelector('[data-testid="background-video"]');

    act(() => render({ ...slide, reference: { ...slide.reference } }, false));
    expect(container.querySelector('[data-projector-scene="visible"]')).toBe(scene);
    expect(container.querySelector('[data-projector-scene="preparing"]')).toBeNull();
    expect(container.querySelector('[data-projector-scene="visible"] [data-testid="background-video"]')).toBe(video);
  });

  it("keeps scripture projection cuts instantaneous despite configured transitions", () => {
    const fade = { effect: "fade" as const, durationMs: 350, easing: "ease" as const };
    const transitions = { scriptures: fade, songs: fade, layout: fade, logo: fade, black: fade, clear: fade };
    const slide = { reference: { book: "John", chapter: 3, verse: 16 }, text: "First verse", version: "KJV" };
    const render = (nextSlide: typeof slide, durationMs = 350) => root.render(
      <ProjectorView title="PROJECTOR OUTPUT" slide={nextSlide} feedOverride="live" overlayMode="widescreen" theme="cross" isLive fontSizePx={48} chrome={false} transitions={{ ...transitions, scriptures: { ...fade, durationMs } }} />,
    );

    act(() => render(slide));
    act(() => readyCallbacks.get("scripture-video.mp4")?.());
    const scene = container.querySelector('[data-projector-scene="visible"]');
    const animatedElements = () => Array.from(scene?.querySelectorAll<HTMLElement>("[style]") ?? [])
      .filter((element) => element.style.animation && element.style.animation !== "none");
    expect(animatedElements()).toHaveLength(0);
    expect(container.querySelector("style")).toBeNull();

    act(() => render({ ...slide, reference: { ...slide.reference } }, 900));
    expect(container.querySelector('[data-projector-scene="visible"]')).toBe(scene);

    act(() => render({ ...slide, reference: { ...slide.reference, verse: 17 }, text: "Second verse" }));
    expect(animatedElements()).toHaveLength(0);
    expect(scene?.textContent).toContain("Second verse");
  });

  it("keeps the live frame mounted while switching layouts and prepares only one incoming background", () => {
    const slide = { reference: { book: "John", chapter: 3, verse: 16 }, text: "Verse", version: "KJV" };
    const render = (overlayMode: "widescreen" | "lower-third") => root.render(
      <ProjectorView title="LIVE" slide={slide} feedOverride="live" overlayMode={overlayMode} theme="cross" isLive fontSizePx={48} />,
    );

    act(() => render("widescreen"));
    act(() => readyCallbacks.get("scripture-video.mp4")?.());
    const oldVideo = container.querySelector('[data-projector-scene="visible"] [data-testid="background-video"]');

    act(() => render("lower-third"));
    expect(container.querySelector('[data-projector-scene="visible"] [data-testid="background-video"]')).toBe(oldVideo);
    expect(container.querySelector('[data-projector-scene="visible"]')?.textContent).toContain("Verse");
    expect(container.querySelector('[data-projector-scene="preparing"]')?.textContent).not.toContain("Verse");
    expect(container.querySelector('[data-projector-scene="preparing"] [data-testid="background-video"]')?.getAttribute("data-visible")).toBe("false");
    expect(container.querySelectorAll('[data-testid="background-video"]')).toHaveLength(2);
    expect(container.querySelector('[data-projector-scene="outgoing"]')).toBeNull();

    act(() => readyCallbacks.get("scripture-lower-video.mp4")?.());
    expect(container.querySelector('[data-projector-scene="visible"] [data-testid="background-video"]')).not.toBe(oldVideo);
    expect(container.querySelector('[data-projector-scene="visible"]')?.textContent).toContain("Verse");
  });

  it("discards an unfinished layout when the operator switches again", () => {
    const slide = { reference: { book: "John", chapter: 3, verse: 16 }, text: "Verse", version: "KJV" };
    const render = (overlayMode: "widescreen" | "lower-third" | "split-screen") => root.render(
      <ProjectorView title="LIVE" slide={slide} feedOverride="live" overlayMode={overlayMode} theme="cross" isLive fontSizePx={48} />,
    );

    act(() => render("widescreen"));
    act(() => readyCallbacks.get("scripture-video.mp4")?.());
    const oldVideo = container.querySelector('[data-projector-scene="visible"] [data-testid="background-video"]');

    act(() => render("lower-third"));
    act(() => render("split-screen"));
    expect(container.querySelector('[data-projector-scene="visible"] [data-testid="background-video"]')).toBe(oldVideo);
    expect(container.querySelector('[data-projector-scene="preparing"] [data-src="scripture-split-video.mp4"]')).not.toBeNull();
    expect(container.querySelector('[data-src="scripture-lower-video.mp4"]')).toBeNull();
    expect(container.querySelectorAll('[data-testid="background-video"]')).toHaveLength(2);

    act(() => readyCallbacks.get("scripture-split-video.mp4")?.());
    expect(container.querySelector('[data-projector-scene="visible"] [data-src="scripture-split-video.mp4"]')).not.toBeNull();

    act(() => render("lower-third"));
    expect(container.querySelectorAll('[data-testid="background-video"]')).toHaveLength(2);
    expect(container.querySelector('[data-projector-scene="outgoing"]')).toBeNull();
  });

  it("waits for an image background before revealing song content", () => {
    defaults.songs.widescreen = "song-image";
    const song = { reference: { book: "Song", chapter: 1, verse: 1 }, text: "Lyrics", version: "SONG" };
    act(() => root.render(<ProjectorView title="PROJECTOR OUTPUT" slide={song} feedOverride="live" overlayMode="widescreen" theme="cross" isLive fontSizePx={48} chrome={false} />));
    expect(container.querySelector('[data-projector-scene="visible"]')).toBeNull();
    expect(container.querySelector('[data-projector-scene="preparing"]')?.textContent).not.toContain("Lyrics");
    act(() => container.querySelector<HTMLImageElement>('img[src="song.jpg"]')?.dispatchEvent(new Event("load")));
    expect(container.querySelector('[data-projector-scene="visible"]')?.textContent).toContain("Lyrics");
  });

  it("reveals the canvas when an image background fails to load", () => {
    defaults.songs.widescreen = "song-image";
    const song = { reference: { book: "Song", chapter: 1, verse: 1 }, text: "Lyrics", version: "SONG" };
    act(() => root.render(<ProjectorView title="PROJECTOR OUTPUT" slide={song} feedOverride="live" overlayMode="widescreen" theme="cross" isLive fontSizePx={48} chrome={false} />));
    expect(container.querySelector('[data-projector-scene="visible"]')).toBeNull();
    act(() => container.querySelector<HTMLImageElement>('img[src="song.jpg"]')?.dispatchEvent(new Event("error")));
    expect(container.querySelector('[data-projector-scene="visible"]')?.textContent).toContain("Lyrics");
  });

  it("does not stay black forever when a background load stalls", () => {
    vi.useFakeTimers();
    try {
      const scripture = { reference: { book: "John", chapter: 3, verse: 16 }, text: "Verse", version: "KJV" };
      act(() => root.render(<ProjectorView title="PROJECTOR OUTPUT" slide={scripture} feedOverride="live" overlayMode="widescreen" theme="cross" isLive fontSizePx={48} chrome={false} />));
      expect(container.querySelector('[data-projector-scene="visible"]')).toBeNull();
      act(() => vi.advanceTimersByTime(6000));
      expect(container.querySelector('[data-projector-scene="visible"]')?.textContent).toContain("Verse");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not keep the previous layout on the external output when the incoming background stalls", () => {
    vi.useFakeTimers();
    try {
      const slide = { reference: { book: "John", chapter: 3, verse: 16 }, text: "Verse", version: "KJV" };
      const render = (overlayMode: "widescreen" | "lower-third") => root.render(
        <ProjectorView title="PROJECTOR OUTPUT" slide={slide} feedOverride="live" overlayMode={overlayMode} theme="cross" isLive fontSizePx={48} chrome={false} />,
      );
      act(() => render("widescreen"));
      act(() => readyCallbacks.get("scripture-video.mp4")?.());
      act(() => render("lower-third"));
      expect(container.querySelector('[data-projector-scene="visible"] [data-src="scripture-video.mp4"]')).not.toBeNull();
      act(() => vi.advanceTimersByTime(6000));
      expect(container.querySelector('[data-projector-scene="visible"] [data-src="scripture-lower-video.mp4"]')).not.toBeNull();
      expect(container.querySelector('[data-projector-scene="visible"]')?.textContent).toContain("Verse");
    } finally {
      vi.useRealTimers();
    }
  });

  it("switches to the selected layout if its camera reports an error", () => {
    defaults.scriptures["lower-third"] = "scripture-lower-camera";
    const slide = { reference: { book: "John", chapter: 3, verse: 16 }, text: "Verse", version: "KJV" };
    const render = (overlayMode: "widescreen" | "lower-third") => root.render(
      <ProjectorView title="PROJECTOR OUTPUT" slide={slide} feedOverride="live" overlayMode={overlayMode} theme="cross" isLive fontSizePx={48} chrome={false} />,
    );
    act(() => render("widescreen"));
    act(() => readyCallbacks.get("scripture-video.mp4")?.());
    act(() => render("lower-third"));
    expect(container.querySelector('[data-projector-scene="visible"] [data-src="scripture-video.mp4"]')).not.toBeNull();
    act(() => container.querySelector<HTMLButtonElement>('[data-projector-scene="preparing"] [data-testid="camera-feed"]')?.click());
    expect(container.querySelector('[data-projector-scene="visible"] [data-testid="camera-feed"]')).not.toBeNull();
  });

  it("does not leave the previous layout up when a camera never reports a frame or error", () => {
    vi.useFakeTimers();
    try {
      defaults.scriptures["lower-third"] = "scripture-lower-camera";
      const slide = { reference: { book: "John", chapter: 3, verse: 16 }, text: "Verse", version: "KJV" };
      const render = (overlayMode: "widescreen" | "lower-third") => root.render(
        <ProjectorView title="PROJECTOR OUTPUT" slide={slide} feedOverride="live" overlayMode={overlayMode} theme="cross" isLive fontSizePx={48} chrome={false} />,
      );
      act(() => render("widescreen"));
      act(() => readyCallbacks.get("scripture-video.mp4")?.());
      act(() => render("lower-third"));
      act(() => vi.advanceTimersByTime(2500));
      expect(container.querySelector('[data-projector-scene="visible"] [data-testid="camera-feed"]')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows slide content when the output window has no matching template", () => {
    defaults.scriptures.widescreen = null;
    const scripture = { reference: { book: "John", chapter: 3, verse: 16 }, text: "For God so loved the world", version: "KJV" };
    act(() => root.render(<ProjectorView title="PROJECTOR OUTPUT" slide={scripture} feedOverride="live" overlayMode="widescreen" theme="cross" isLive fontSizePx={48} chrome={false} />));
    expect(container.querySelector('[data-projector-template-fallback]')?.textContent).toContain("For God so loved the world");
  });
});
