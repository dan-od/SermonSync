const WINDOW_SECONDS = 12;

export function liveWaveformWindow(duration: number, time: number) {
  const span = Math.min(Math.max(duration, 0), WINDOW_SECONDS);
  const start = Math.min(Math.max(0, time - span * 0.35), Math.max(0, duration - span));
  return { start, end: start + span };
}
