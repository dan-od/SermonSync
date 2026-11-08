// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../Library/Scriptures/ScripturesTab", async () => {
  const { makeLibraryTabProbe } = await import("./libraryTabProbe");
  return { ScripturesTab: makeLibraryTabProbe("scriptures") };
});
vi.mock("../Library/Songs/SongsTab", async () => {
  const { makeLibraryTabProbe } = await import("./libraryTabProbe");
  return { SongsTab: makeLibraryTabProbe("songs") };
});
vi.mock("../Library/Media/MediaTab", async () => {
  const { makeLibraryTabProbe } = await import("./libraryTabProbe");
  return { MediaTab: makeLibraryTabProbe("media") };
});
vi.mock("../Overlays/OverlaysTab", async () => {
  const { makeLibraryTabProbe } = await import("./libraryTabProbe");
  return { OverlaysTab: makeLibraryTabProbe("overlays") };
});
vi.mock("../Library/Templates/TemplatesTab", async () => {
  const { makeLibraryTabProbe } = await import("./libraryTabProbe");
  return { TemplatesTab: makeLibraryTabProbe("templates") };
});

import { LocalLibraryPanel } from "../LocalLibraryPanel";
import type { LibraryTab } from "../Library/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Local Library tab state", () => {
  let container: HTMLDivElement;
  let root: Root;
  let activeTab: LibraryTab;
  let activeNavigation: ((direction: -1 | 1) => void) | null;
  const navigationEvent = vi.fn();
  const handleNavigationEvent = (event: Event) => navigationEvent((event as CustomEvent).detail);
  const searchQueries: Record<LibraryTab, string> = {
    scriptures: "psalm 23",
    songs: "amazing grace",
    media: "",
    overlays: "",
    templates: "",
  };
  const tabs: LibraryTab[] = ["scriptures", "songs", "media", "overlays", "templates"];

  const render = () => root.render(
    <LocalLibraryPanel
      activeTab={activeTab}
      searchQuery={searchQueries[activeTab]}
      searchQueries={searchQueries}
      searchMode="words"
      onActiveTabChange={(tab) => { activeTab = tab; renderPanel(); }}
      previewReference={null}
      liveReference={null}
      onPreviewSlide={vi.fn()}
      onSendLive={vi.fn()}
      onNavigationHandlerChange={(handler) => { activeNavigation = handler; }}
    />
  );
  const renderPanel = () => act(() => render());

  beforeEach(() => {
    activeTab = "scriptures";
    activeNavigation = null;
    navigationEvent.mockClear();
    window.addEventListener("library-tab-navigation-test", handleNavigationEvent);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.removeEventListener("library-tab-navigation-test", handleNavigationEvent);
  });

  it("retains each visited tab’s input, filters, expanded state, scroll, and independent query", () => {
    renderPanel();
    for (const tab of tabs) {
      if (activeTab !== tab) {
        const tabButton = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === tab.toUpperCase());
        act(() => tabButton?.click());
      }
      const view = container.querySelector(`[data-library-tab="${tab}"]`)!;
      const input = view.querySelector<HTMLInputElement>(`input[aria-label="${tab} draft"]`)!;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      act(() => {
        setter?.call(input, `${tab} unsaved work`);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      const filter = view.querySelector<HTMLSelectElement>(`select[aria-label="${tab} filter"]`)!;
      act(() => {
        filter.value = "custom";
        filter.dispatchEvent(new Event("change", { bubbles: true }));
      });
      act(() => view.querySelector<HTMLButtonElement>("button[aria-expanded]")?.click());
      const scroll = view.querySelector<HTMLElement>(`[data-testid="${tab}-scroll"]`)!;
      scroll.scrollTop = 72 + tabs.indexOf(tab);
      expect(view.querySelector(`output[aria-label="${tab} query"]`)?.textContent).toBe(searchQueries[tab]);
    }

    for (const tab of [...tabs].reverse()) {
      if (activeTab !== tab) {
        const tabButton = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === tab.toUpperCase());
        act(() => tabButton?.click());
      }
      const view = container.querySelector(`[data-library-tab="${tab}"]`)!;
      expect(view.querySelector<HTMLInputElement>(`input[aria-label="${tab} draft"]`)?.value).toBe(`${tab} unsaved work`);
      expect(view.querySelector<HTMLSelectElement>(`select[aria-label="${tab} filter"]`)?.value).toBe("custom");
      expect(view.querySelector("button[aria-expanded]")?.getAttribute("aria-expanded")).toBe("true");
      expect(view.querySelector<HTMLElement>(`[data-testid="${tab}-scroll"]`)?.scrollTop).toBe(72 + tabs.indexOf(tab));
    }
  });

  it("routes library navigation only through the active Scripture or Songs tab", () => {
    renderPanel();
    expect(activeNavigation).toBeTypeOf("function");
    activeNavigation?.(1);
    expect(navigationEvent).toHaveBeenCalledWith({ tab: "scriptures", direction: 1 });

    const songsButton = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "SONGS");
    act(() => songsButton?.click());
    expect(activeNavigation).toBeTypeOf("function");
    activeNavigation?.(-1);
    expect(navigationEvent).toHaveBeenLastCalledWith({ tab: "songs", direction: -1 });

    const mediaButton = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "MEDIA");
    act(() => mediaButton?.click());
    expect(activeNavigation).toBeNull();
  });
});
