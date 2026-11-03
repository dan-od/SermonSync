/**
 * Seek-bar helpers for the dev-only test feed (SS-072).
 */
import type { TestFeedCue } from "../types/state";

/** Every jump lands this far before the point picked, so the lead-in is
 * heard and Stage 0 gets the whole sentence that names the verse. */
export const SEEK_LEAD_SECONDS = 10;

/** "h:mm:ss" for a time in seconds. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** "42:15", "1:02:03", "90" or "90.5" → seconds; null when it isn't a time. */
export function parseClock(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(trimmed)) return null;
  const parts = trimmed.split(":").map(Number);
  if (parts.slice(1).some((p) => p >= 60)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

/** Where a jump to `t` actually lands: SEEK_LEAD_SECONDS earlier, inside the media. */
export function leadIn(t: number, duration: number | null): number {
  const target = Math.max(0, t - SEEK_LEAD_SECONDS);
  return duration ? Math.min(target, Math.max(0, duration - 1)) : target;
}

/** Keep a relative jump (−10 s / +30 s) inside the media. */
export function clampTime(t: number, duration: number | null): number {
  const clamped = Math.max(0, t);
  return duration ? Math.min(clamped, Math.max(0, duration - 1)) : clamped;
}

/** The caption line being spoken at `t` (cues sorted by start), or the one
 * that just ended when `t` falls in a short pause. */
export function cueAt(cues: TestFeedCue[], t: number, maxGap = 2): TestFeedCue | null {
  let lo = 0;
  let hi = cues.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= t) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found < 0) return null;
  const cue = cues[found];
  return t < cue.end + maxGap ? cue : null;
}

/** Arrow-key seek steps: ←/→ 5 s, Shift+←/→ 30 s; null for any other key. */
export function seekStepForKey(event: { key: string; shiftKey: boolean }): number | null {
  const step = event.shiftKey ? 30 : 5;
  if (event.key === "ArrowLeft") return -step;
  if (event.key === "ArrowRight") return step;
  return null;
}

/** Whether a key event comes from a field that uses the arrow keys itself. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== "string") return false;
  const element = target as HTMLElement;
  return (
    element.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName.toUpperCase())
  );
}

/** "John 3:16 — 99.1%" for a detected marker's tooltip. */
export function detectedMarkerLabel(marker: { reference: string; confidence: number }): string {
  return `${marker.reference} — ${(marker.confidence * 100).toFixed(1)}%`;
}

/** Seconds at a horizontal offset across a bar `width` px wide. */
export function timeAtOffset(offsetX: number, width: number, duration: number): number {
  if (width <= 0 || duration <= 0) return 0;
  return Math.min(duration, Math.max(0, (offsetX / width) * duration));
}
