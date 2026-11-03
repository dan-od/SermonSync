// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export type SessionStatus = "idle" | "active" | "paused" | "ended";

export interface SessionState {
  id: string | null;
  status: SessionStatus;
  /** epoch ms when the session started, or null if not started */
  startTime: number | null;
  /** elapsed seconds of active session time */
  elapsed: number;
  unitId: string | null;
}
