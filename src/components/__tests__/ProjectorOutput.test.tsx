// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Silences React's "not configured to support act(...)" warning under jsdom.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// `vi.mock` factories are hoisted above imports/consts, so shared mock state
// must be created via `vi.hoisted` to avoid a TDZ error.
const { postMessageMock, subscribeChannelMock, unsubscribeChannelMock, initializeTemplatesMock, reloadTemplatesMock, projectorViewMock, getListenCallback, sendChannelMessage, clearListenCallbacks } = vi.hoisted(() => {
  let channelCallback: ((message: { type: string; snapshot?: unknown; revision?: number; progress?: unknown }) => void) | undefined;
  const postMessageMock = vi.fn();
  const unlistenMock = vi.fn();
  const subscribeChannelMock = vi.fn((callback: (message: { type: string; snapshot?: unknown; revision?: number; progress?: unknown }) => void) => {
    channelCallback = callback;
    return unlistenMock;
  });
  const initializeTemplatesMock = vi.fn(async (): Promise<void> => undefined);
  const reloadTemplatesMock = vi.fn(async () => undefined);
  const projectorViewMock = vi.fn((props: unknown) => props);
  return {
    postMessageMock,
    subscribeChannelMock,
    unsubscribeChannelMock: unlistenMock,
    initializeTemplatesMock,
    reloadTemplatesMock,
    projectorViewMock,
    getListenCallback: (event = "projector://state") => event === "templates://changed"
      ? () => channelCallback?.({ type: "templates-changed" })
      : (incoming: { payload: unknown }) => channelCallback?.({ type: "state", snapshot: incoming.payload }),
    sendChannelMessage: (message: { type: string; progress: unknown }) => channelCallback?.(message),
    clearListenCallbacks: () => { channelCallback = undefined; },
  };
});

vi.mock("../../lib/projectorChannel", () => ({
  postProjectorChannelMessage: postMessageMock,
  subscribeProjectorChannel: subscribeChannelMock,
}));
vi.mock("../../stores/templateStore", () => ({
  useTemplateStore: (selector: (state: { initialize: () => Promise<void>; reload: () => Promise<void> }) => unknown) => (
    selector({ initialize: initializeTemplatesMock, reload: reloadTemplatesMock })
  ),
}));
vi.mock("../ProjectorView", () => ({
  ProjectorView: (props: { slide: { text: string } | null; feedOverride: string; overlays?: Array<{ definition: { id: string } }>; playback?: { playing: boolean; looping: boolean; seekRevision: number }; audioProgress?: { time: number } | null }) => {
    projectorViewMock(props);
    return (
      <div data-testid="projector-view" data-feed={props.feedOverride} data-slide={props.slide?.text ?? ""} data-overlays={props.overlays?.map((entry) => entry.definition.id).join(",") ?? ""} data-playing={String(props.playback?.playing)} data-looping={String(props.playback?.looping)} data-seek-revision={props.playback?.seekRevision} data-audio-time={props.audioProgress?.time ?? ""} />
    );
  },
}));

import { ProjectorOutput } from "../ProjectorOutput";
import { TEMPLATE_THEMES_CHANGED_EVENT } from "../../lib/templateStorage";

const TRANSITIONS = {
  scriptures: { effect: "fade", durationMs: 350, easing: "ease-in-out" },
  songs: { effect: "fade", durationMs: 350, easing: "ease-in-out" },
  layout: { effect: "fade", durationMs: 350, easing: "ease-in-out" },
  logo: { effect: "fade", durationMs: 350, easing: "ease-in-out" },
  black: { effect: "cut", durationMs: 0, easing: "linear" },
  clear: { effect: "fade", durationMs: 350, easing: "ease-in-out" },
} as const;

describe("ProjectorOutput", () => {
  let container: HTMLDivElement;
  let root: Root;
  let unmounted: boolean;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    unmounted = false;
    clearListenCallbacks();
  });

  afterEach(() => {
    if (!unmounted) act(() => root.unmount());
    container.remove();
  });

  it("subscribes to projector state events and announces readiness on mount", async () => {
    await act(async () => {
      root.render(<ProjectorOutput />);
    });

    expect(subscribeChannelMock).toHaveBeenCalledWith(expect.any(Function));
    expect(postMessageMock).toHaveBeenCalledWith({ type: "ready" });
    expect(initializeTemplatesMock).toHaveBeenCalled();
  });

  it("announces readiness after subscribing even if templates are still loading", async () => {
    let finishInitialization: (() => void) | undefined;
    initializeTemplatesMock.mockImplementationOnce(() => new Promise<void>((resolve) => { finishInitialization = resolve; }));
    await act(async () => root.render(<ProjectorOutput />));
    expect(postMessageMock).toHaveBeenCalledWith({ type: "ready" });

    await act(async () => finishInitialization?.());
    expect(postMessageMock).toHaveBeenCalledTimes(1);
  });

  it("reloads saved templates while the projector window is open", async () => {
    await act(async () => {
      root.render(<ProjectorOutput />);
    });

    await act(async () => {
      getListenCallback(TEMPLATE_THEMES_CHANGED_EVENT)?.({ payload: null });
    });
    expect(reloadTemplatesMock).toHaveBeenCalledTimes(1);
  });

  it("forwards an incoming snapshot to the renderer", async () => {
    await act(async () => {
      root.render(<ProjectorOutput />);
    });

    const view = container.querySelector('[data-testid="projector-view"]');
    expect(view?.getAttribute("data-feed")).toBe("black");
    expect(view?.getAttribute("data-slide")).toBe("");

    await act(async () => {
      getListenCallback()?.({
        payload: {
          slide: { reference: { book: "John", chapter: 3, verse: 16 }, text: "For God so loved the world", version: "KJV" },
          feedOverride: "live",
          overlayMode: "widescreen",
          theme: "cross",
          transitions: TRANSITIONS,
        },
      });
    });

    const updated = container.querySelector('[data-testid="projector-view"]');
    expect(updated?.getAttribute("data-feed")).toBe("live");
    expect(updated?.getAttribute("data-slide")).toBe("For God so loved the world");
  });

  it("applies updated audio peaks when the media path is unchanged", async () => {
    await act(async () => root.render(<ProjectorOutput />));
    const snapshot = {
      slide: null,
      media: { path: "/media/choir.mp3", name: "Choir", category: "audio", fit: "cover", opacity: 1, audioWaveform: [0.2, 0.4], audioWaveformMin: [-0.2, -0.4], audioWaveformMax: [0.2, 0.4], audioDuration: 12 },
      feedOverride: "live",
      overlayMode: "widescreen",
      theme: "cross",
      transitions: TRANSITIONS,
    };
    await act(async () => getListenCallback()?.({ payload: snapshot }));
    const callsBeforeWaveformUpdate = projectorViewMock.mock.calls.length;

    await act(async () => getListenCallback()?.({ payload: {
      ...snapshot,
      media: { ...snapshot.media, audioWaveform: [0.2, 0.9], audioWaveformMin: [-0.2, -0.8], audioWaveformMax: [0.2, 0.9], audioDuration: 12 },
    } }));

    expect(projectorViewMock).toHaveBeenCalledTimes(callsBeforeWaveformUpdate + 1);
    expect((projectorViewMock.mock.calls.at(-1)?.[0] as { media: { audioWaveform: number[] } }).media.audioWaveform).toEqual([0.2, 0.9]);
    expect((projectorViewMock.mock.calls.at(-1)?.[0] as { media: { audioWaveformMin: number[] } }).media.audioWaveformMin).toEqual([-0.2, -0.8]);
  });

  it("tracks the active audio playhead without playing audio in the output", async () => {
    await act(async () => root.render(<ProjectorOutput />));
    await act(async () => getListenCallback()?.({ payload: {
      slide: null, media: { path: "/media/choir.mp3", name: "Choir", category: "audio", fit: "cover", opacity: 1 },
      feedOverride: "live", overlayMode: "widescreen", theme: "cross", transitions: TRANSITIONS,
    } }));
    await act(async () => sendChannelMessage({ type: "audio-progress", progress: { path: "/media/choir.mp3", time: 5, duration: 12 } }));
    expect(container.querySelector('[data-testid="projector-view"]')?.getAttribute("data-audio-time")).toBe("5");
    await act(async () => sendChannelMessage({ type: "audio-progress", progress: { path: "/media/other.mp3", time: 9, duration: 20 } }));
    expect(container.querySelector('[data-testid="projector-view"]')?.getAttribute("data-audio-time")).toBe("");
  });

  it("acknowledges a received LIVE snapshot", async () => {
    await act(async () => root.render(<ProjectorOutput />));
    await act(async () => getListenCallback()?.({ payload: {
      revision: 17,
      slide: { reference: { book: "John", chapter: 3, verse: 16 }, text: "For God so loved the world", version: "KJV" },
      feedOverride: "live", overlayMode: "widescreen", theme: "cross", transitions: TRANSITIONS,
    } }));
    expect(postMessageMock).toHaveBeenCalledWith({ type: "ack", revision: 17 });
    expect(container.querySelector('[data-testid="projector-view"]')?.getAttribute("data-slide")).toBe("For God so loved the world");
  });

  it("updates the output when overlays change without replacing the slide", async () => {
    await act(async () => root.render(<ProjectorOutput />));
    const base = { slide: null, media: null, feedOverride: "live", overlayMode: "widescreen", theme: "cross", transitions: TRANSITIONS };
    await act(async () => getListenCallback()?.({ payload: base }));
    await act(async () => getListenCallback()?.({ payload: {
      ...base,
      overlays: [{ definition: { id: "timer-1" }, startedAt: 1000 }],
    } }));

    expect(container.querySelector('[data-testid="projector-view"]')?.getAttribute("data-overlays")).toBe("timer-1");
    await act(async () => getListenCallback()?.({ payload: {
      ...base,
      overlays: [
        { definition: { id: "timer-1" }, startedAt: 1000 },
        { definition: { id: "alert-2" }, startedAt: 1000 },
      ],
    } }));
    expect(container.querySelector('[data-testid="projector-view"]')?.getAttribute("data-overlays")).toBe("alert-2");
  });

  it("ignores a duplicate snapshot with identical content and skips a re-render", async () => {
    await act(async () => {
      root.render(<ProjectorOutput />);
    });

    const snapshot = {
      slide: { reference: { book: "Romans", chapter: 10, verse: 9 }, text: "Confess with thy mouth", version: "KJV" },
      feedOverride: "live",
      overlayMode: "widescreen",
      theme: "cross",
      transitions: TRANSITIONS,
    };

    await act(async () => {
      getListenCallback()?.({ payload: snapshot });
    });
    const callsAfterFirst = projectorViewMock.mock.calls.length;

    await act(async () => {
      getListenCallback()?.({ payload: { ...snapshot } });
    });
    expect(projectorViewMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it("updates the output when LIVE playback changes without changing slides", async () => {
    await act(async () => root.render(<ProjectorOutput />));
    const snapshot = {
      slide: { reference: { book: "John", chapter: 3, verse: 16 }, text: "Verse", version: "KJV" },
      feedOverride: "live", overlayMode: "widescreen", theme: "cross", transitions: TRANSITIONS,
      playback: { playing: true, looping: true, seekTime: null, seekRevision: 0 },
    };
    await act(async () => getListenCallback()?.({ payload: snapshot }));
    await act(async () => getListenCallback()?.({ payload: { ...snapshot, playback: { playing: false, looping: false, seekTime: 12.5, seekRevision: 1 } } }));

    const view = container.querySelector('[data-testid="projector-view"]');
    expect(view?.getAttribute("data-playing")).toBe("false");
    expect(view?.getAttribute("data-looping")).toBe("false");
    expect(view?.getAttribute("data-seek-revision")).toBe("1");
  });

  it("switches the output from a scripture to a song snapshot", async () => {
    await act(async () => root.render(<ProjectorOutput />));

    await act(async () => getListenCallback()?.({
      payload: {
        slide: { reference: { book: "Exodus", chapter: 1, verse: 2 }, text: "Reuben, Simeon, Levi, and Judah", version: "KJV" },
        feedOverride: "live", overlayMode: "widescreen", theme: "cross", transitions: TRANSITIONS,
      },
    }));
    await act(async () => getListenCallback()?.({
      payload: {
        slide: { reference: { book: "Acoustic Guitarist", chapter: 1, verse: 1 }, text: "We won't stop Praising You", version: "SONG" },
        feedOverride: "live", overlayMode: "widescreen", theme: "cross", transitions: TRANSITIONS,
      },
    }));

    const view = container.querySelector('[data-testid="projector-view"]');
    expect(view?.getAttribute("data-slide")).toBe("We won't stop Praising You");
  });

  it("unsubscribes from projector state events on unmount", async () => {
    await act(async () => {
      root.render(<ProjectorOutput />);
    });

    await act(async () => {
      root.unmount();
    });

    unmounted = true;
    expect(unsubscribeChannelMock).toHaveBeenCalled();
  });
});
