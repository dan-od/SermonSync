import { beforeEach, describe, expect, it } from "vitest";

import { useProjectorStore } from "../projectorStore";

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
});
