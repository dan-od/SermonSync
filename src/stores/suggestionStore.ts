/**
 * Suggestion deck store (SS-004 scaffold).
 *
 * Holds the chronological deck of scripture suggestion cards emitted by the
 * 4-stage matching pipeline. TODO(Dee): subscribe to the /ws/audio
 * "suggestions" event and append/merge cards; wire SEND LIVE / EDIT / DISMISS
 * to the projector store and sidecar.
 */
import { create } from "zustand";

import type { SidecarSuggestionsEvent, SuggestionCard, SuggestionStatus } from "../types/state";

interface SuggestionStore {
  cards: SuggestionCard[];
  setCards: (cards: SuggestionCard[]) => void;
  addCard: (card: SuggestionCard) => void;
  addCards: (cards: SuggestionCard[]) => void;
  ingestSuggestions: (event: SidecarSuggestionsEvent, themes?: string[]) => void;
  togglePin: (id: string) => void;
  updateStatus: (id: string, status: SuggestionStatus) => void;
  editReference: (id: string, card: Partial<SuggestionCard>) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

const MAX_DECK_SIZE = 20;

function stageOrFallback(value: number): 1 | 2 | 3 | 4 {
  if (value === 1 || value === 2 || value === 3 || value === 4) {
    return value;
  }
  return 4;
}

function cardKey(card: Pick<SuggestionCard, "reference" | "version">) {
  return `${card.reference.book}:${card.reference.chapter}:${card.reference.verse}:${card.version}`;
}

function mergeCards(existing: SuggestionCard[], incoming: SuggestionCard[]) {
  const deck = existing.map((card) => ({
    ...card,
    createdAt: card.createdAt ?? Date.now(),
    pinned: card.pinned ?? false,
  }));

  for (const candidate of incoming) {
    const next = {
      ...candidate,
      createdAt: candidate.createdAt ?? Date.now(),
      pinned: candidate.pinned ?? false,
    };
    const key = cardKey(next);
    const index = deck.findIndex((card) => cardKey(card) === key);
    if (index === -1) {
      deck.unshift(next);
      continue;
    }

    const current = deck[index];
    if (next.confidence >= current.confidence) {
      deck[index] = {
        ...current,
        ...next,
        pinned: current.pinned,
        status: current.status,
        createdAt: current.createdAt ?? next.createdAt,
      };
    }
  }

  return deck.slice(0, MAX_DECK_SIZE);
}

export const useSuggestionStore = create<SuggestionStore>((set) => ({
  cards: [],

  setCards: (cards) =>
    set({
      cards: mergeCards([], cards),
    }),

  // TODO(Dee): dedupe by reference, keep highest confidence (see orchestrator).
  addCard: (card) => set((s) => ({ cards: mergeCards(s.cards, [card]) })),

  addCards: (incoming) => set((s) => ({ cards: mergeCards(s.cards, incoming) })),

  ingestSuggestions: (event, themes = []) =>
    set((s) => {
      const now = Date.now();
      const incoming = event.results.map<SuggestionCard>((result) => ({
        id: `${result.book}-${result.chapter}-${result.verse}-${result.stage}`,
        reference: {
          book: result.book,
          chapter: result.chapter,
          verse: result.verse,
        },
        text: result.text,
        confidence: result.confidence,
        pipelineStage: stageOrFallback(result.stage),
        status: "pending",
        version: result.version,
        themes,
        createdAt: now,
        pinned: false,
      }));
      return { cards: mergeCards(s.cards, incoming) };
    }),

  togglePin: (id) =>
    set((s) => ({
      cards: s.cards.map((card) => (card.id === id ? { ...card, pinned: !card.pinned } : card)),
    })),

  updateStatus: (id, status) =>
    set((s) => ({
      cards: s.cards.map((c) => (c.id === id ? { ...c, status } : c)),
    })),

  // TODO(Dee): validate reference against the Bible API before applying.
  editReference: (id, patch) =>
    set((s) => ({
      cards: s.cards.map((c) =>
        c.id === id ? { ...c, ...patch, status: "edited" } : c,
      ),
    })),

  dismiss: (id) =>
    set((s) => ({
      cards: s.cards.filter((card) => card.id !== id),
    })),

  clear: () => set({ cards: [] }),
}));
