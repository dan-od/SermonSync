// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { defaults, videoElementCallbacks, readyCallbacks, flags } = vi.hoisted(() => ({
  defaults: {
    scriptures: { widescreen: "scripture-video" as string | null, "lower-third": "scripture-lower-video" as string | null, "split-screen": "scripture-split-video" as string | null },
    songs: { widescreen: "song-video" as string | null, "lower-third": null as string | null, "split-screen": null as string | null },
  },
  videoElementCallbacks: vi.fn(),
  readyCallbacks: new Map<string, () => void>(),
  flags: { sharedBackground: false },
}));

vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (path: string) => `asset://localhost${path}` }));
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
vi.mock("../../stores/projectorStore", () => ({
  useProjectorStore: (selector: (state: unknown) => unknown) => selector({
    logo: { src: null, fit: "contain" }, transitions: {},
  }),
}));
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
    expect(container.querySelector('img[alt="Photo"]')).toBe(image);

    act(() => render("live"));
    expect(container.querySelector<HTMLElement>("[data-projector-media]")?.style.opacity).toBe("1");
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

  it("keeps the outgoing scripture visible until the song background has a frame", () => {
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
    expect(container.querySelector('[data-projector-scene="outgoing"]')?.textContent).toContain("Verse");
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

  it("finishes a scripture entrance once and only animates again for new verse content", () => {
    const fade = { effect: "fade" as const, durationMs: 350, easing: "ease" as const, crossfade: false, motionBlur: false };
    const transitions = { scriptures: fade, songs: fade, layout: fade, logo: fade, black: fade, clear: fade };
    const slide = { reference: { book: "John", chapter: 3, verse: 16 }, text: "First verse", version: "KJV" };
    const render = (nextSlide: typeof slide, durationMs = 350) => root.render(
      <ProjectorView title="PROJECTOR OUTPUT" slide={nextSlide} feedOverride="live" overlayMode="widescreen" theme="cross" isLive fontSizePx={48} chrome={false} transitions={{ ...transitions, scriptures: { ...fade, durationMs } }} />,
    );

    act(() => render(slide));
    act(() => readyCallbacks.get("scripture-video.mp4")?.());
    const scene = container.querySelector('[data-projector-scene="visible"]');
    const entrance = scene?.querySelector<HTMLElement>('[style*="projFadeIn"]');
    expect(entrance?.style.animation).toContain("projFadeIn");
    expect(container.querySelector("style")).toBeNull();

    act(() => entrance?.dispatchEvent(new Event("animationend", { bubbles: true })));
    expect(entrance?.style.animation).toBe("none");
    act(() => render({ ...slide, reference: { ...slide.reference } }, 900));
    expect(container.querySelector('[data-projector-scene="visible"]')).toBe(scene);
    expect(scene?.querySelector('[style*="projFadeIn"]')).toBeNull();
    expect(entrance?.style.animation).toBe("none");

    act(() => render({ ...slide, reference: { ...slide.reference, verse: 17 }, text: "Second verse" }));
    const nextEntrance = scene?.querySelector<HTMLElement>('[style*="projFadeIn"]');
    expect(nextEntrance).not.toBe(entrance);
    expect(nextEntrance?.style.animation).toContain("projFadeIn");
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
