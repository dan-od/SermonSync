import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SHORTCUTS, isShortcutEvent, shortcutActionForEvent, shortcutFromEvent, useShortcutStore } from "../shortcutStore";

function keyEvent(key: string, modifiers: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return { key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, isComposing: false, ...modifiers } as KeyboardEvent;
}

describe("shortcut matching", () => {
  it("uses the recorded modifier combination exactly", () => {
    expect(shortcutFromEvent(keyEvent("l", { ctrlKey: true, shiftKey: true }))).toBe("Ctrl+Shift+L");
    expect(isShortcutEvent(keyEvent("l", { ctrlKey: true, shiftKey: true }), "Ctrl+Shift+L")).toBe(true);
    expect(isShortcutEvent(keyEvent("l", { ctrlKey: true }), "Ctrl+Shift+L")).toBe(false);
  });

  it("ignores modifier-only and composing keys", () => {
    expect(shortcutFromEvent(keyEvent("Control", { ctrlKey: true }))).toBe("");
    expect(shortcutFromEvent(keyEvent("a", { isComposing: true }))).toBe("");
    expect(isShortcutEvent(keyEvent("Control", { ctrlKey: true }), "")).toBe(false);
  });

  it("uses remapped navigation instead of the former arrow binding", () => {
    const shortcuts = { ...DEFAULT_SHORTCUTS, "library-next": "N" };
    expect(shortcutActionForEvent(keyEvent("n"), shortcuts)).toBe("library-next");
    expect(shortcutActionForEvent(keyEvent("ArrowRight"), shortcuts)).toBeNull();
  });
});

describe("shortcut store", () => {
  beforeEach(() => {
    const entries = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); }, removeItem: (key: string) => { entries.delete(key); } } });
    useShortcutStore.getState().resetShortcuts();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("rejects a binding already assigned to another action", () => {
    useShortcutStore.getState().setShortcut("feed-logo", "L");
    expect(useShortcutStore.getState().shortcuts["feed-logo"]).toBe("O");
    useShortcutStore.getState().setShortcut("feed-logo", "P");
    expect(shortcutActionForEvent(keyEvent("p"), useShortcutStore.getState().shortcuts)).toBe("feed-logo");
  });
});
