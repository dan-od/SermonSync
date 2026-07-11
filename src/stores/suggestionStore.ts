/**
 * Suggestion deck store (SS-004 scaffold).
 *
 * Holds the chronological deck of scripture suggestion cards emitted by the
 * 4-stage matching pipeline. TODO(Dee): subscribe to the /ws/audio
 * "suggestions" event and append/merge cards; wire SEND LIVE / EDIT / DISMISS
 * to the projector store and sidecar.
 */
import { create } from "zustand";

import type { SuggestionCard, SuggestionStatus } from "../types/state";

interface SuggestionStore {
  cards: SuggestionCard[];
  addCard: (card: SuggestionCard) => void;
  addCards: (cards: SuggestionCard[]) => void;
  updateStatus: (id: string, status: SuggestionStatus) => void;
  editReference: (id: string, card: Partial<SuggestionCard>) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useSuggestionStore = create<SuggestionStore>((set) => ({
  cards: [],

  // TODO(Dee): dedupe by reference, keep highest confidence (see orchestrator).
  addCard: (card) => set((s) => ({ cards: [...s.cards, card] })),

  addCards: (incoming) => set((s) => ({ cards: [...s.cards, ...incoming] })),

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
      cards: s.cards.map((c) =>
        c.id === id ? { ...c, status: "dismissed" } : c,
      ),
    })),

  clear: () => set({ cards: [] }),
}));
