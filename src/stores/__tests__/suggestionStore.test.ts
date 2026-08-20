import { beforeEach, describe, expect, it } from "vitest";

import { useSuggestionStore } from "../suggestionStore";

describe("suggestionStore", () => {
  beforeEach(() => {
    useSuggestionStore.getState().clear();
  });

  it("deduplicates by reference and keeps higher confidence", () => {
    const store = useSuggestionStore.getState();

    store.addCard({
      id: "a",
      reference: { book: "John", chapter: 3, verse: 16 },
      text: "low",
      confidence: 0.5,
      pipelineStage: 2,
      status: "pending",
      version: "KJV",
      themes: [],
    });

    store.addCard({
      id: "b",
      reference: { book: "John", chapter: 3, verse: 16 },
      text: "high",
      confidence: 0.9,
      pipelineStage: 3,
      status: "pending",
      version: "KJV",
      themes: [],
    });

    const state = useSuggestionStore.getState();
    expect(state.cards).toHaveLength(1);
    expect(state.cards[0].text).toBe("high");
  });

  it("ingests sidecar suggestions and applies themes", () => {
    useSuggestionStore.getState().ingestSuggestions(
      {
        type: "suggestions",
        sentence: "test",
        results: [
          {
            reference: "John 3:16",
            book: "John",
            chapter: 3,
            verse: 16,
            text: "For God so loved the world",
            version: "KJV",
            confidence: 0.87,
            confidence_pct: 87,
            stage: 7,
            source_stages: [1, 2],
          },
        ],
      },
      ["SALVATION"],
    );

    const [card] = useSuggestionStore.getState().cards;
    expect(card.pipelineStage).toBe(4);
    expect(card.themes).toEqual(["SALVATION"]);
  });

  it("keeps newest suggestions at top and allows pinning", () => {
    const store = useSuggestionStore.getState();

    store.addCard({
      id: "older",
      reference: { book: "Acts", chapter: 1, verse: 8 },
      text: "older",
      confidence: 0.8,
      pipelineStage: 2,
      status: "pending",
      version: "KJV",
      themes: [],
      createdAt: 100,
      pinned: false,
    });

    store.addCard({
      id: "newer",
      reference: { book: "John", chapter: 3, verse: 16 },
      text: "newer",
      confidence: 0.8,
      pipelineStage: 2,
      status: "pending",
      version: "KJV",
      themes: [],
      createdAt: 200,
      pinned: false,
    });

    expect(useSuggestionStore.getState().cards[0].id).toBe("newer");

    store.togglePin("older");
    const pinned = useSuggestionStore.getState().cards.find((card) => card.id === "older");
    expect(pinned?.pinned).toBe(true);
  });

  it("removes dismissed cards and caps the deck at 20 cards", () => {
    const store = useSuggestionStore.getState();
    const cards = Array.from({ length: 21 }, (_, index) => ({
      id: `card-${index}`,
      reference: { book: "John", chapter: 3, verse: index + 1 },
      text: `verse ${index + 1}`,
      confidence: 0.8,
      pipelineStage: 2 as const,
      status: "pending" as const,
      version: "KJV",
      themes: [],
      createdAt: index,
    }));

    store.addCards(cards);

    expect(useSuggestionStore.getState().cards).toHaveLength(20);
    store.dismiss("card-20");
    expect(useSuggestionStore.getState().cards.some((card) => card.id === "card-20")).toBe(false);
  });
});
