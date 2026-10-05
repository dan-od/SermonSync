import { beforeEach, describe, expect, it } from "vitest";

import { useProjectorStore } from "../projectorStore";
import { createOverlayDraft } from "../../types/overlays";

describe("projectorStore", () => {
  beforeEach(() => {
    useProjectorStore.getState().reset();
  });

  it("sets preview and sends live slide", () => {
    const slide = {
      reference: { book: "John", chapter: 3, verse: 16 },
      text: "For God so loved the world",
      version: "KJV",
    };

    useProjectorStore.getState().setPreview(slide);
    useProjectorStore.getState().sendLive(slide);

    const state = useProjectorStore.getState();
    expect(state.previewSlide).toEqual(slide);
    expect(state.liveSlide).toEqual(slide);
    expect(state.currentSlide).toEqual(slide);
    expect(state.isLive).toBe(true);
  });

  it("keeps overlays across slide changes and clears them with the screen", () => {
    const store = useProjectorStore.getState();
    const overlay = createOverlayDraft("timer");
    store.toggleOverlay(overlay);
    const startedAt = useProjectorStore.getState().activeOverlays[0].startedAt;
    expect(useProjectorStore.getState().isLive).toBe(true);

    store.sendLive({ reference: { book: "John", chapter: 1, verse: 1 }, text: "Verse", version: "KJV" });
    expect(useProjectorStore.getState().activeOverlays).toHaveLength(1);
    store.updateActiveOverlay({ ...overlay, durationSeconds: 90 });
    expect(useProjectorStore.getState().activeOverlays[0].startedAt).toBe(startedAt);
    expect(useProjectorStore.getState().activeOverlays[0].definition.durationSeconds).toBe(90);

    store.clearScreen();
    expect(useProjectorStore.getState().activeOverlays).toHaveLength(0);
  });

  it("allows only one active overlay at a time", () => {
    const first = { ...createOverlayDraft("timer"), id: "timer-a" };
    const second = { ...createOverlayDraft("timer"), id: "timer-b" };
    const store = useProjectorStore.getState();
    store.toggleOverlay(first);
    expect(useProjectorStore.getState().activeOverlays.map((entry) => entry.definition.id)).toEqual(["timer-a"]);

    store.toggleOverlay(second);
    expect(useProjectorStore.getState().activeOverlays.map((entry) => entry.definition.id)).toEqual(["timer-b"]);

    store.toggleOverlay(second);
    expect(useProjectorStore.getState().activeOverlays).toHaveLength(0);
  });

  it("switches overlay mode immediately for shared preview/live renderer state", () => {
    const slide = {
      reference: { book: "Romans", chapter: 10, verse: 9 },
      text: "That if thou shalt confess with thy mouth",
      version: "KJV",
    };

    const store = useProjectorStore.getState();
    store.setPreview(slide);
    store.sendLive(slide);
    expect(useProjectorStore.getState().overlayMode).toBe("widescreen");

    store.setOverlayMode("lower-third");
    expect(useProjectorStore.getState().overlayMode).toBe("lower-third");

    store.setOverlayMode("widescreen");
    const next = useProjectorStore.getState();
    expect(next.overlayMode).toBe("widescreen");
    expect(next.previewSlide).toEqual(slide);
    expect(next.liveSlide).toEqual(slide);
  });

  it("tracks connected displays and the selected output", () => {
    const display = {
      id: "display-hdmi",
      name: "HDMI-1",
      friendlyName: "Projector",
      width: 1920,
      height: 1080,
      refreshHz: 60,
      x: 1920,
      y: 0,
      scaleFactor: 1,
      isPrimary: false,
      connected: true,
    };

    const store = useProjectorStore.getState();
    store.setAvailableDisplays([display]);
    store.selectDisplay(display.id);
    store.setOutputStatus("connected");

    const state = useProjectorStore.getState();
    expect(state.availableDisplays).toEqual([display]);
    expect(state.selectedDisplayId).toBe("display-hdmi");
    expect(state.outputDisplay).toBe("display-hdmi");
    expect(state.outputStatus).toBe("connected");
  });

  it("walks through the full output status lifecycle", () => {
    const store = useProjectorStore.getState();

    expect(useProjectorStore.getState().outputStatus).toBe("closed");

    store.setOutputStatus("ready");
    expect(useProjectorStore.getState().outputStatus).toBe("ready");

    store.setOutputStatus("connected");
    expect(useProjectorStore.getState().outputStatus).toBe("connected");

    store.setOutputStatus("disconnected");
    expect(useProjectorStore.getState().outputStatus).toBe("disconnected");

    store.setOutputStatus("error");
    expect(useProjectorStore.getState().outputStatus).toBe("error");

    store.setOutputStatus("closed");
    expect(useProjectorStore.getState().outputStatus).toBe("closed");
  });

  it("selectDisplay and setOutputDisplay keep the legacy and stable fields in sync", () => {
    const store = useProjectorStore.getState();

    store.selectDisplay("display-a");
    expect(useProjectorStore.getState().selectedDisplayId).toBe("display-a");
    expect(useProjectorStore.getState().outputDisplay).toBe("display-a");

    store.setOutputDisplay("display-b");
    expect(useProjectorStore.getState().selectedDisplayId).toBe("display-b");
    expect(useProjectorStore.getState().outputDisplay).toBe("display-b");

    store.selectDisplay(null);
    expect(useProjectorStore.getState().selectedDisplayId).toBeNull();
    expect(useProjectorStore.getState().outputDisplay).toBeNull();
  });

  it("clearScreen drops the live/current slide but reset() restores full initial state", () => {
    const slide = {
      reference: { book: "Psalm", chapter: 23, verse: 1 },
      text: "The Lord is my shepherd",
      version: "KJV",
    };

    const store = useProjectorStore.getState();
    store.sendLive(slide);
    store.setOutputStatus("connected");
    store.selectDisplay("display-hdmi");

    store.clearScreen();
    let state = useProjectorStore.getState();
    expect(state.liveSlide).toBeNull();
    expect(state.currentSlide).toBeNull();
    expect(state.isLive).toBe(false);
    // clearScreen only affects the live slide, not display/output selection.
    expect(state.outputStatus).toBe("connected");
    expect(state.selectedDisplayId).toBe("display-hdmi");

    store.reset();
    state = useProjectorStore.getState();
    expect(state.outputStatus).toBe("closed");
    expect(state.selectedDisplayId).toBeNull();
    expect(state.availableDisplays).toEqual([]);
  });

  it("toggleLive flips or forces the live flag independently of the slide feed", () => {
    const store = useProjectorStore.getState();

    store.toggleLive(true);
    expect(useProjectorStore.getState().isLive).toBe(true);

    store.toggleLive();
    expect(useProjectorStore.getState().isLive).toBe(false);

    store.toggleLive();
    expect(useProjectorStore.getState().isLive).toBe(true);
  });

  it("shares LIVE playback and records each seek as a new command", () => {
    const store = useProjectorStore.getState();
    store.setLivePlayback({ playing: false, looping: false });
    store.seekLivePlayback(12.5);
    store.seekLivePlayback(12.5);

    expect(useProjectorStore.getState().livePlayback).toEqual({
      playing: false, looping: false, seekTime: 12.5, seekRevision: 2,
    });
  });

  it("starts a newly projected slide while keeping the operator's loop choice", () => {
    const store = useProjectorStore.getState();
    store.setLivePlayback({ playing: false, looping: false });
    store.seekLivePlayback(12.5);
    store.sendLive({ reference: { book: "Song", chapter: 1, verse: 1 }, text: "Lyrics", version: "SONG" });

    expect(useProjectorStore.getState().livePlayback).toMatchObject({
      playing: true, looping: false, seekTime: null,
    });
  });
});
