/**
 * Dev-only live-feed test harness state (SS-072).
 *
 * `enabled` mirrors the sidecar's SERMONSYNC_DEV_FEED flag (from
 * /api/engine/status); `status` follows the sidecar's "test_feed" events.
 */
import { create } from "zustand";

import { prepareTestFeed } from "../lib/sidecarClient";

import type { SidecarTestFeedEvent, TestFeedDetectedMarker, TestFeedSourceInfo } from "../types/state";

export const ACTIVE_TEST_FEED_STATES: ReadonlyArray<SidecarTestFeedEvent["state"]> = [
  "loading",
  "playing",
  "draining",
];

interface TestFeedStore {
  enabled: boolean;
  status: SidecarTestFeedEvent | null;
  /** Length of the feed's source media, from its status (null until it opens). */
  duration: number | null;
  /** References the matcher suggested during the current or last feed run. */
  markers: TestFeedDetectedMarker[];
  /** Duration, caption cues and reference markers of the loaded source (seek bar). */
  sourceInfo: TestFeedSourceInfo | null;
  /** Source being loaded (POST /prepare), and why the last load failed. */
  sourceLoading: string | null;
  sourceError: string | null;
  setEnabled: (enabled: boolean) => void;
  setStatus: (status: SidecarTestFeedEvent | null) => void;
  setSourceInfo: (sourceInfo: TestFeedSourceInfo | null) => void;
  /** Load `source` for the seek bar, once per source string. */
  loadSource: (source: string) => Promise<void>;
}

export const useTestFeedStore = create<TestFeedStore>()((set, get) => ({
  enabled: false,
  status: null,
  duration: null,
  markers: [],
  sourceInfo: null,
  sourceLoading: null,
  sourceError: null,
  setEnabled: (enabled) => set({ enabled }),
  setStatus: (status) =>
    set({ status, duration: status?.duration ?? null, markers: status?.markers ?? [] }),
  setSourceInfo: (sourceInfo) => set({ sourceInfo }),
  loadSource: async (source) => {
    const key = source.trim();
    const { sourceInfo, sourceLoading } = get();
    if (!key || key === sourceInfo?.source || key === sourceLoading) return;
    set({ sourceLoading: key, sourceError: null });
    try {
      const info = await prepareTestFeed(key);
      // Keyed by what was asked for (the sidecar resolves local paths).
      set({ sourceInfo: { ...info, source: key } });
    } catch (err) {
      set({ sourceError: err instanceof Error ? err.message : String(err) });
    } finally {
      if (get().sourceLoading === key) set({ sourceLoading: null });
    }
  },
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
