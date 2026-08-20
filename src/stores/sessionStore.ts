/**
 * Session store (SS-004 scaffold).
 *
 * Tracks the live sermon session lifecycle and coordinates sidecar start/end
 * requests with the local session state.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { SessionState, SidecarSystemStatusEvent } from "../types/state";
import { endSidecarSession, startSidecarSession } from "../lib/sidecarClient";
import { getBrowserStorage } from "./persistStorage";

interface SessionStore extends SessionState {
  wsConnected: boolean;
  lastHealth: SidecarSystemStatusEvent["status"];
  lastLatencyMs: number;
  uptimeSeconds: number;
  start: (unitId: string, unitName?: string) => void;
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

      start: (unitId, unitName) => {
        const startTime = Date.now();
        set({
          id: `session-${startTime}`,
          status: "active",
          unitId,
          startTime,
          elapsed: 0,
        });
        void startSidecarSession(unitId, unitName).catch((error: unknown) => {
          console.error("Failed to start sidecar session", error);
        });
      },

      pause: () => set({ status: "paused" }),

      resume: () => set({ status: "active" }),

      end: () => {
        set({ status: "ended" });
        void endSidecarSession().catch((error: unknown) => {
          console.error("Failed to end sidecar session", error);
        });
      },

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
