import { useEffect } from "react";

import { useSessionStore } from "../stores";
import type { SessionStatus } from "../types/state";

type SessionStoreState = ReturnType<typeof useSessionStore.getState>;

export function useSessionTimer(
  sessionStatus: SessionStatus,
  sessionStartTime: SessionStoreState["startTime"],
  sessionTick: SessionStoreState["tick"],
) {
  useEffect(() => {
    if (sessionStatus !== "active" || !sessionStartTime) {
      return;
    }

    const id = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
      sessionTick(elapsed);
    }, 1000);

    return () => window.clearInterval(id);
  }, [sessionStartTime, sessionStatus, sessionTick]);
}
