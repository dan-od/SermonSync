// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ShortcutsTab } from "../Settings/tabs/ShortcutsTab";
import { isShortcutEvent, useShortcutStore } from "../../stores/shortcutStore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("shortcut recording", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.clear();
    useShortcutStore.getState().resetShortcuts();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("waits for B after Ctrl before saving the black overlay shortcut", () => {
    useShortcutStore.getState().setShortcut("feed-black", "Ctrl+J");
    act(() => root.render(<ShortcutsTab />));
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Change shortcut for Black overlay"]')!;

    act(() => button.click());
    act(() => button.dispatchEvent(new KeyboardEvent("keydown", { key: "Control", ctrlKey: true, bubbles: true, cancelable: true })));
    expect(button.textContent).toBe("Press keys");
    expect(useShortcutStore.getState().shortcuts["feed-black"]).toBe("Ctrl+J");

    act(() => button.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true, cancelable: true })));
    expect(button.textContent).toBe("Ctrl+B");
    expect(useShortcutStore.getState().shortcuts["feed-black"]).toBe("Ctrl+B");
    expect(isShortcutEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true }), "Ctrl+B")).toBe(true);
    expect(isShortcutEvent(new KeyboardEvent("keydown", { key: "Control", ctrlKey: true }), "Ctrl+Control")).toBe(false);
  });

  it("warns when a shortcut moves and leaves its previous action unassigned", () => {
    act(() => root.render(<ShortcutsTab />));
    const logoButton = container.querySelector<HTMLButtonElement>('button[aria-label="Change shortcut for Logo overlay"]')!;
    const blackButton = container.querySelector<HTMLButtonElement>('button[aria-label="Change shortcut for Black overlay"]')!;

    act(() => logoButton.click());
    act(() => logoButton.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true, cancelable: true })));

    expect(logoButton.textContent).toBe("Ctrl+B");
    expect(blackButton.textContent).toBe("Unassigned");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Black overlay");
    expect(useShortcutStore.getState().shortcuts["feed-black"]).toBe("");
    expect(isShortcutEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true }), useShortcutStore.getState().shortcuts["feed-black"])).toBe(false);

    act(() => blackButton.click());
    act(() => blackButton.dispatchEvent(new KeyboardEvent("keydown", { key: "j", ctrlKey: true, bubbles: true, cancelable: true })));
    expect(blackButton.textContent).toBe("Ctrl+J");
    expect(useShortcutStore.getState().shortcuts["feed-logo"]).toBe("Ctrl+B");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
