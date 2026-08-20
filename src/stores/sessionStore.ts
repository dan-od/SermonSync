/**
 * Session store (SS-004 scaffold).
 *
 * Tracks the live sermon session lifecycle. Actions here are stubs with the
 * state shape locked in — TODO(Dee): wire timer intervals, persistence, and
 * sidecar session start/end calls.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { SessionState, SidecarSystemStatusEvent } from "../types/state";
import { getBrowserStorage } from "./persistStorage";

interface SessionStore extends SessionState {
  wsConnected: boolean;
  lastHealth: SidecarSystemStatusEvent["status"];
  lastLatencyMs: number;
  uptimeSeconds: number;
  start: (unitId: string) => void;
  pause: () => void;
  resume: () => void;
  end: () => void;
  tick: (elapsed: number) => void;
  setWsConnected: (connected: boolean) => void;
  applySystemStatus: (payload: SidecarSystemStatusEvent) => void;
  reset: () => void;
}

const initialState: SessionState = {
  id: null,
  status: "idle",
  startTime: null,
  elapsed: 0,
  unitId: null,
};

export const useSessionStore = create<SessionStore>()(
  persist(
    (set) => ({
      ...initialState,
      wsConnected: false,
      lastHealth: "idle",
      lastLatencyMs: 0,
      uptimeSeconds: 0,

      // TODO(Dee): generate a real session id and POST /api/session/start.
      start: (unitId) =>
        set({
          id: `session-${Date.now()}`,
          status: "active",
          unitId,
          startTime: Date.now(),
          elapsed: 0,
        }),

      pause: () => set({ status: "paused" }),

      resume: () => set({ status: "active" }),

      // TODO(Dee): POST /api/session/end and flush to archive.
      end: () => set({ status: "ended" }),

      // TODO(Dee): drive this from a 1s interval while status === "active".
      tick: (elapsed) => set({ elapsed }),

      setWsConnected: (wsConnected) => set({ wsConnected }),

      applySystemStatus: (payload) =>
        set({
          lastHealth: payload.status,
          lastLatencyMs: payload.latency_ms,
          uptimeSeconds: payload.uptime_seconds,
        }),

      reset: () =>
        set({
          ...initialState,
          wsConnected: false,
          lastHealth: "idle",
          lastLatencyMs: 0,
          uptimeSeconds: 0,
        }),
    }),
    {
      name: "sermonsync-session-store",
      storage: createJSONStorage(getBrowserStorage),
      partialize: (state) => ({
        id: state.id,
        status: state.status,
        startTime: state.startTime,
        elapsed: state.elapsed,
        unitId: state.unitId,
      }),
    },
  ),
);
