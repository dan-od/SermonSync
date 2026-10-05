// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("shortcut persistence", () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
  });

  it("restores the default when an old modifier-only binding was saved", async () => {
    window.localStorage.setItem("sermonsync-shortcuts-v1", JSON.stringify({ "feed-black": "Ctrl+Control" }));
    const { useShortcutStore } = await import("../shortcutStore");
    expect(useShortcutStore.getState().shortcuts["feed-black"]).toBe("Ctrl+B");

    useShortcutStore.getState().setShortcut("feed-black", "Ctrl+Control");
    expect(useShortcutStore.getState().shortcuts["feed-black"]).toBe("Ctrl+B");
  });

  it("keeps an intentionally unassigned shortcut blank after reload", async () => {
    window.localStorage.setItem("sermonsync-shortcuts-v1", JSON.stringify({ "feed-black": "", "feed-logo": "Ctrl+B" }));
    const { useShortcutStore } = await import("../shortcutStore");
    expect(useShortcutStore.getState().shortcuts["feed-black"]).toBe("");
    expect(useShortcutStore.getState().shortcuts["feed-logo"]).toBe("Ctrl+B");
  });
});
