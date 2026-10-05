// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OverlayVisual } from "../Overlays/OverlayVisual";
import { createOverlayDraft } from "../../types/overlays";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("OverlayVisual timer urgency", () => {
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
    vi.restoreAllMocks();
  });

  it("starts blinking at ten seconds and keeps blinking at zero", () => {
    vi.spyOn(Date, "now").mockReturnValue(100_000);
    const overlay = createOverlayDraft("timer");
    const timer = overlay.elements?.find((element) => element.type === "timer");
    if (!timer || timer.type !== "timer") throw new Error("timer widget was not created");
    timer.durationSeconds = 20;

    const renderAt = (remaining: number) => {
      const elapsed = timer.durationSeconds - remaining;
      root.render(<OverlayVisual overlay={overlay} startedAt={100_000 - elapsed * 1000} />);
    };

    act(() => renderAt(10));
    const widget = () => container.querySelector<HTMLElement>(`[data-overlay-widget-id="${timer.id}"]`)!;
    expect(widget().dataset.overlayTimerBlinking).toBe("true");
    expect(widget().style.animation).toContain("ssOverlayTimerBlink");

    act(() => renderAt(0));
    expect(widget().textContent).toBe("00:00");
    expect(widget().dataset.overlayTimerBlinking).toBe("true");
  });

  it("does not blink while more than ten seconds remain", () => {
    vi.spyOn(Date, "now").mockReturnValue(100_000);
    const overlay = createOverlayDraft("timer");
    const timer = overlay.elements?.find((element) => element.type === "timer");
    if (!timer || timer.type !== "timer") throw new Error("timer widget was not created");
    timer.durationSeconds = 20;

    act(() => root.render(<OverlayVisual overlay={overlay} startedAt={100_000} />));
    const widget = container.querySelector<HTMLElement>(`[data-overlay-widget-id="${timer.id}"]`)!;
    expect(widget.textContent).toBe("00:20");
    expect(widget.dataset.overlayTimerBlinking).toBeUndefined();
    expect(widget.style.animation).toBe("");
  });
});
