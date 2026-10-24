import { useEffect } from "react";

export function useSessionTicker(sessionStartTime: number | null, sessionStatus: string, sessionTick: (elapsed: number) => void) {
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
