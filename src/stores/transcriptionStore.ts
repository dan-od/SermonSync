/**
 * Transcription store (SS-004 completion).
 *
 * Owns streaming transcription fragments, finalized sentence events, and the
 * timeline rendered by the desktop console.
 */
import { create } from "zustand";

import type {
  SidecarContextUpdateEvent,
  SidecarSentenceEvent,
  SidecarTranscriptionEvent,
  TranscriptionEvent,
  TranscriptionState,
  TranscriptItem,
} from "../types/state";

const MAX_EVENTS = 100;
const MAX_TIMELINE_ITEMS = 20;

// Timeline row ids added by ingestTranscription since the last assembled
// sentence, so ingestSentence can replace them instead of duplicating a row
// for the same speech once punctuation/silence finalizes it.
let pendingFragmentIds: string[] = [];

interface TranscriptionStore extends TranscriptionState {
  seedTimeline: (items: TranscriptItem[]) => void;
  addManualTimelineItem: (text: string, matches?: string[]) => void;
  ingestTranscription: (event: SidecarTranscriptionEvent) => void;
  ingestSentence: (event: SidecarSentenceEvent, matches?: string[]) => void;
  setThemes: (event: SidecarContextUpdateEvent) => void;
  clear: () => void;
  reset: () => void;
}

const initialState: TranscriptionState = {
  events: [],
  timeline: [],
  latestPartial: "",
  contextWindow: [],
  themes: [],
  themeConfidence: 0,
};

function formatTimestamp(epochMs: number) {
  return new Date(epochMs).toLocaleTimeString("en-GB", { hour12: false });
}

function mapTranscriptionEvent(event: SidecarTranscriptionEvent): TranscriptionEvent {
  return {
    id: `tx-${event.timestamp}-${Math.random().toString(16).slice(2, 8)}`,
    timestamp: event.timestamp,
    text: event.text,
    type: "speech",
    confidence: event.confidence,
    isFinal: event.is_final,
    language: event.language,
    latencyMs: event.latency_ms,
  };
}

function clampEvents(events: TranscriptionEvent[]) {
  return events.slice(-MAX_EVENTS);
}

function clampTimeline(items: TranscriptItem[]) {
  return items.slice(0, MAX_TIMELINE_ITEMS);
}

export const useTranscriptionStore = create<TranscriptionStore>((set) => ({
  ...initialState,

  seedTimeline: (timeline) => set({ timeline: clampTimeline(timeline) }),

  addManualTimelineItem: (text, matches = []) =>
    set((s) => {
      const now = Date.now();
      const nextItem: TranscriptItem = {
        id: `manual-${now}`,
        timestamp: formatTimestamp(now),
        speaker: "Manual Override",
        text,
        matches,
      };
      return { timeline: clampTimeline([nextItem, ...s.timeline]) };
    }),

  ingestTranscription: (event) =>
    set((s) => {
      const mapped = mapTranscriptionEvent(event);
      let nextTimeline = s.timeline;
      if (event.is_final && event.text.trim()) {
        pendingFragmentIds.push(mapped.id);
        nextTimeline = clampTimeline([
          {
            id: mapped.id,
            timestamp: formatTimestamp(event.timestamp),
            speaker: "Resident Minister",
            text: event.text,
            matches: [],
          },
          ...s.timeline,
        ]);
      }
      return {
        events: clampEvents([...s.events, mapped]),
        timeline: nextTimeline,
        latestPartial: event.is_final ? "" : event.text,
      };
    }),

  ingestSentence: (event, matches = []) =>
    set((s) => {
      const fragmentIds = new Set(pendingFragmentIds);
      pendingFragmentIds = [];
      const baseTimeline = fragmentIds.size > 0 ? s.timeline.filter((item) => !fragmentIds.has(item.id)) : s.timeline;

      const nextItem: TranscriptItem = {
        id: `sentence-${event.timestamp}-${Math.random().toString(16).slice(2, 8)}`,
        timestamp: formatTimestamp(event.timestamp),
        speaker: "Resident Minister",
        text: event.text,
        matches,
      };

      const sentenceEvent: TranscriptionEvent = {
        id: `sentence-event-${event.timestamp}-${Math.random().toString(16).slice(2, 8)}`,
        timestamp: event.timestamp,
        text: event.text,
        type: "speech",
        confidence: 1,
        isFinal: true,
        context: event.context,
      };

      return {
        timeline: clampTimeline([nextItem, ...baseTimeline]),
        events: clampEvents([...s.events, sentenceEvent]),
        latestPartial: "",
        contextWindow: event.context,
      };
    }),

  setThemes: (event) => set({ themes: event.themes, themeConfidence: event.confidence }),

  clear: () => {
    pendingFragmentIds = [];
    set({ events: [], timeline: [], latestPartial: "", contextWindow: [] });
  },

  reset: () => {
    pendingFragmentIds = [];
    set({ ...initialState });
  },
}));
