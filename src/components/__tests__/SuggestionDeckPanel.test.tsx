// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SuggestionDeckPanel } from "../SuggestionDeckPanel";
import type { SuggestionCard } from "../../types/state";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("SuggestionDeckPanel", () => {
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

  it("renders the whole capped deck before the first scroll", async () => {
    const cards: SuggestionCard[] = Array.from({ length: 20 }, (_, index) => ({
      id: `card-${index}`,
      reference: { book: "John", chapter: 1, verse: index + 1 },
      text: `Suggestion ${index + 1}`,
      confidence: 0.9,
      pipelineStage: 1,
      status: "pending",
      version: "KJV",
      themes: [],
      createdAt: index,
    }));

    await act(async () => root.render(
      <SuggestionDeckPanel
        cards={cards}
        previewReference={null}
        onPreview={vi.fn()}
        onSendLive={vi.fn()}
        onSendEditedLive={vi.fn()}
        onTogglePin={vi.fn()}
        onDismiss={vi.fn()}
        onClearAll={vi.fn()}
      />,
    ));

    expect(container.querySelectorAll(".ss-suggestion-scroll-pane > article")).toHaveLength(20);
  });

  it("routes card, pin, send, and dismiss clicks to their actions", async () => {
    const card: SuggestionCard = {
      id: "john-3-16",
      reference: { book: "John", chapter: 3, verse: 16 },
      text: "For God so loved the world",
      confidence: 0.82,
      pipelineStage: 2,
      status: "pending",
      version: "KJV",
      themes: [],
    };
    const onPreview = vi.fn();
    const onSendLive = vi.fn();
    const onTogglePin = vi.fn();
    const onDismiss = vi.fn();

    await act(async () => root.render(
      <SuggestionDeckPanel
        cards={[card]}
        previewReference={null}
        onPreview={onPreview}
        onSendLive={onSendLive}
        onSendEditedLive={vi.fn()}
        onTogglePin={onTogglePin}
        onDismiss={onDismiss}
        onClearAll={vi.fn()}
      />,
    ));

    act(() => container.querySelector<HTMLElement>(".ss-suggestion-scroll-pane > article")?.click());
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Pin John 3:16"]')?.click());
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Send John 3:16 live"]')?.click());
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Dismiss John 3:16"]')?.click());

    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onTogglePin).toHaveBeenCalledWith(card);
    expect(onSendLive).toHaveBeenCalledWith(card);
    expect(onDismiss).toHaveBeenCalledWith(card.id);
  });
});
