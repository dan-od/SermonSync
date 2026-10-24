/**
 * Dev-only live-feed test harness state (SS-072).
 *
 * `enabled` mirrors the sidecar's SERMONSYNC_DEV_FEED flag (from
 * /api/engine/status); `status` follows the sidecar's "test_feed" events.
 */
import { create } from "zustand";

import type { SidecarTestFeedEvent } from "../types/state";

export const ACTIVE_TEST_FEED_STATES: ReadonlyArray<SidecarTestFeedEvent["state"]> = [
  "loading",
  "playing",
  "draining",
];

interface TestFeedStore {
  enabled: boolean;
  status: SidecarTestFeedEvent | null;
  setEnabled: (enabled: boolean) => void;
  setStatus: (status: SidecarTestFeedEvent | null) => void;
}

export const useTestFeedStore = create<TestFeedStore>()((set) => ({
  enabled: false,
  status: null,
  setEnabled: (enabled) => set({ enabled }),
  setStatus: (status) => set({ status }),
}));

export function isTestFeedActive(status: SidecarTestFeedEvent | null): boolean {
  return status !== null && ACTIVE_TEST_FEED_STATES.includes(status.state);
}

/** "mm:ss" (or "h:mm:ss") for a position in seconds. */
export function formatFeedPosition(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
