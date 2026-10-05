// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (path: string) => path, invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

import { LocalLibraryPanel } from "../LocalLibraryPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("scripture scheduling", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      const body = url.includes("/api/bible/versions")
        ? { versions: [{ abbreviation: "TEST", name: "Test Bible", available: true, verse_count: 1 }] }
        : url.includes("/api/bible/books")
          ? { books: [{ name: "John", abbreviation: "Jn", testament: "NT", position: 1 }] }
          : url.includes("/api/bible/search")
            ? { results: [{ book: "John", chapter: 3, verse: 16, text: "For God so loved the world" }] }
            : {};
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("selects a search result for the schedule bar without per-verse add buttons", async () => {
    const onSelectedScriptureChange = vi.fn();
    const onSendLive = vi.fn();
    const onPreviewSlide = vi.fn();
    await act(async () => root.render(
      <LocalLibraryPanel
        activeTab="scriptures"
        searchQuery="loved"
        searchMode="words"
        onActiveTabChange={vi.fn()}
        previewReference={null}
        liveReference={null}
        onPreviewSlide={onPreviewSlide}
        onSendLive={onSendLive}
        onSelectedScriptureChange={onSelectedScriptureChange}
        onPreviewMedia={vi.fn()}
        onSendMedia={vi.fn()}
      />,
    ));

    const verseRow = () => [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes("For God so loved the world"));
    for (let attempt = 0; attempt < 8 && !verseRow(); attempt += 1) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    }
    expect(verseRow()).not.toBeUndefined();
    expect(container.querySelector('button[aria-label^="Add John"]')).toBeNull();
    const previewFirst = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === "Preview First");
    await act(async () => previewFirst!.click());
    await act(async () => verseRow()!.click());

    expect(onSelectedScriptureChange).toHaveBeenCalledWith({
      reference: { book: "John", chapter: 3, verse: 16 },
      text: "For God so loved the world",
      version: "Test Bible",
    });
    expect(onPreviewSlide).toHaveBeenCalled();
    expect(onSendLive).not.toHaveBeenCalled();
  });
});
