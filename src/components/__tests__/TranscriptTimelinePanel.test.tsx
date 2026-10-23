// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TranscriptTimelinePanel } from "../TranscriptTimelinePanel";
import type { TranscriptItem } from "../desktop/uiTypes";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function createItems(prefix: string): TranscriptItem[] {
  return Array.from({ length: 20 }, (_, index) => ({
    id: `${prefix}-${index}`,
    timestamp: `12:00:${String(index).padStart(2, "0")}`,
    speaker: "Resident Minister",
    text: `Transcript ${prefix} ${index}`,
    matches: [],
  }));
}

describe("TranscriptTimelinePanel", () => {
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

  it("keeps the scroll content limited to the current capped timeline items", async () => {
    const render = (items: TranscriptItem[]) => root.render(
      <TranscriptTimelinePanel items={items} onAddManualTranscript={vi.fn()} />,
    );

    const previousItems = createItems("old");
    const newestItem: TranscriptItem = {
      id: "newest",
      timestamp: "12:01:00",
      speaker: "Resident Minister",
      text: "Newest transcript",
      matches: [],
    };
    await act(async () => render(previousItems));
    await act(async () => render([newestItem, ...previousItems.slice(0, 19)]));

    expect(container.querySelectorAll(".ss-transcript-enter, .ss-transcript-exit")).toHaveLength(20);
    const viewport = container.querySelector<HTMLElement>(".scripture-scroll-pane");
    expect(viewport?.style.overscrollBehaviorY).toBe("contain");
    expect([...container.querySelectorAll<HTMLElement>(".ss-transcript-enter")].every((row) => row.style.flexShrink === "0")).toBe(true);
  });
});
