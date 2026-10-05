// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { songState } = vi.hoisted(() => ({
  songState: {
    songs: [{ id: "song-1", title: "Test Song", artist: "Choir", slides: [
      { label: "Verse 1", text: "First lyrics" },
      { label: "Chorus", text: "Second lyrics" },
    ] }],
    initialize: vi.fn(),
    deleteSong: vi.fn(),
    renameSong: vi.fn(),
    createSong: vi.fn(),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (path: string) => path, invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("../../stores/songStore", () => ({ useSongStore: (selector: (state: typeof songState) => unknown) => selector(songState) }));

import { LocalLibraryPanel } from "../LocalLibraryPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("song selection projection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("waits for a slide click and routes it through the selected action", () => {
    const onPreviewSlide = vi.fn();
    const onSendLive = vi.fn();
    act(() => root.render(
      <LocalLibraryPanel
        activeTab="songs"
        searchQuery=""
        searchMode="words"
        onActiveTabChange={vi.fn()}
        previewReference={null}
        liveReference={null}
        onPreviewSlide={onPreviewSlide}
        onSendLive={onSendLive}
        onPreviewMedia={vi.fn()}
        onSendMedia={vi.fn()}
      />,
    ));

    const buttonContaining = (text: string) => [...(container.querySelector('[data-library-tab="songs"]')?.querySelectorAll("button") ?? [])].find((button) => button.textContent?.includes(text));
    act(() => buttonContaining("Test Song")?.click());
    expect(onPreviewSlide).not.toHaveBeenCalled();
    expect(onSendLive).not.toHaveBeenCalled();

    act(() => buttonContaining("First lyrics")?.click());
    expect(onSendLive).toHaveBeenCalledOnce();
    expect(onSendLive.mock.calls[0][0].text).toBe("First lyrics");
    expect(onPreviewSlide).not.toHaveBeenCalled();

    act(() => buttonContaining("Preview First")?.click());
    act(() => buttonContaining("Second lyrics")?.click());
    expect(onPreviewSlide).toHaveBeenCalledOnce();
    expect(onPreviewSlide.mock.calls[0][0].text).toBe("Second lyrics");
    expect(onSendLive).toHaveBeenCalledOnce();
  });
});
