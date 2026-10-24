// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotesModal } from "../NotesModal";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("NotesModal", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("opens as a dialog with a close button and Escape dismissal", async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(<NotesModal open items={[]} pendingCount={0} onClose={onClose} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(document.body.querySelector('[role="dialog"][aria-label="Notes and summary"]')).not.toBeNull();
    const closeButton = document.body.querySelector<HTMLButtonElement>('button[aria-label="Close notes"]');
    expect(closeButton).not.toBeNull();
    act(() => closeButton?.click());
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});