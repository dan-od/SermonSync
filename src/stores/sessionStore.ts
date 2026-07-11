/**
 * Session store (SS-004 scaffold).
 *
 * Tracks the live sermon session lifecycle. Actions here are stubs with the
 * state shape locked in — TODO(Dee): wire timer intervals, persistence, and
 * sidecar session start/end calls.
 */
import { create } from "zustand";

import type { SessionState } from "../types/state";

interface SessionStore extends SessionState {
  start: (unitId: string) => void;
  pause: () => void;
  resume: () => void;
  end: () => void;
  tick: (elapsed: number) => void;
  reset: () => void;
}

const initialState: SessionState = {
  id: null,
  status: "idle",
  startTime: null,
  elapsed: 0,
  unitId: null,
};

export const useSessionStore = create<SessionStore>((set) => ({
  ...initialState,

  // TODO(Dee): generate a real session id and POST /api/session/start.
  start: (unitId) =>
    set({ status: "active", unitId, startTime: Date.now(), elapsed: 0 }),

  pause: () => set({ status: "paused" }),

  resume: () => set({ status: "active" }),

  // TODO(Dee): POST /api/session/end and flush to archive.
  end: () => set({ status: "ended" }),

  // TODO(Dee): drive this from a 1s interval while status === "active".
  tick: (elapsed) => set({ elapsed }),

  reset: () => set({ ...initialState }),
}));
