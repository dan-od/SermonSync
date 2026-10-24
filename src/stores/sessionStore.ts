/**
 * Session store (SS-004 scaffold).
 *
 * Tracks the live sermon session lifecycle and coordinates sidecar start/end
 * requests with the local session state.
 */
import { create } from "zustand";

import type { SessionState, SidecarSystemStatusEvent } from "../types/state";
import { endSidecarSession, startSidecarSession } from "../lib/sidecarClient";

interface SessionStore extends SessionState {
  wsConnected: boolean;
  lastHealth: SidecarSystemStatusEvent["status"];
  lastLatencyMs: number;
  uptimeSeconds: number;
  start: (unitId: string, unitName?: string) => void;
  pause: () => void;
  resume: () => void;
  end: () => Promise<void>;
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

export const useSessionStore = create<SessionStore>()((set, get) => {
  // A session belongs to this app run. Never hydrate its timer or status from storage.
  let pendingStart: Promise<boolean> | null = null;
  let pendingEnd: Promise<void> | null = null;
  let sequence = 0;

  return {
      ...initialState,
      wsConnected: false,
      lastHealth: "idle",
      lastLatencyMs: 0,
      uptimeSeconds: 0,

      start: (unitId, unitName) => {
        if (get().status === "active" || get().status === "paused") return;
        const startTime = Date.now();
        const localId = `session-${startTime}-${++sequence}`;
        const previousEnd = pendingEnd;
        set({
          id: localId,
          status: "active",
          unitId,
          startTime,
          elapsed: 0,
        });
        const request = (async () => {
          try {
            if (previousEnd) await previousEnd;
            const session = await startSidecarSession(unitId, unitName);
            if (get().id === localId) set({ id: session.id });
            return true;
          } catch (error) {
            if (get().id === localId) set(initialState);
            console.error("Failed to start sidecar session", error);
            return false;
          }
        })();
        pendingStart = request;
        void request.then(() => {
          if (pendingStart === request) pendingStart = null;
        });
      },

      pause: () => {
        if (get().status === "active") set({ status: "paused" });
      },

      resume: () => {
        if (get().status === "paused") set({ status: "active" });
      },

      end: async () => {
        const { status, startTime, elapsed } = get();
        if (status !== "active" && status !== "paused") {
          if (pendingEnd) await pendingEnd;
          return;
        }
        set({
          status: "ended",
          elapsed: status === "active" && startTime
            ? Math.max(elapsed, Math.floor((Date.now() - startTime) / 1000))
            : elapsed,
        });
        const startRequest = pendingStart;
        const request = (async () => {
          if (startRequest && !(await startRequest)) return;
          try {
            await endSidecarSession();
          } catch (error) {
            console.error("Failed to end sidecar session", error);
          }
        })();
        pendingEnd = request;
        try {
          await request;
        } finally {
          if (pendingEnd === request) pendingEnd = null;
        }
      },

      tick: (elapsed) => {
        if (get().status === "active") set({ elapsed });
      },

      setWsConnected: (wsConnected) => set({ wsConnected }),

      applySystemStatus: (payload) =>
        set({
          lastHealth: payload.status,
          lastLatencyMs: payload.latency_ms,
          uptimeSeconds: payload.uptime_seconds,
        }),

      reset: () => {
        pendingStart = null;
        pendingEnd = null;
        set({
          ...initialState,
          wsConnected: false,
          lastHealth: "idle",
          lastLatencyMs: 0,
          uptimeSeconds: 0,
        });
      },
  };
});
