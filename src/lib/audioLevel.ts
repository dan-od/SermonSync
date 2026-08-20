/**
 * Perceptual scaling for raw RMS/peak audio levels (0..1 linear).
 *
 * Linear RMS from typical mic input rarely exceeds ~0.2-0.3 during normal
 * speech, so mapping it directly to a 0..1 meter leaves everything pinned
 * near the minimum — visually "flatlined" even while speaking. A dB-based
 * normalization (like a real VU meter) spreads realistic speech levels
 * across the visible range.
 */
const MIN_DB = -55;
const MAX_DB = -4;

export function computeAudioAmplitude(rms: number, peak: number): number {
  const linear = Math.max(Math.min(1, Math.max(0, rms)), Math.min(1, Math.max(0, peak)) * 0.85);
  if (linear <= 0.0001) {
    return 0;
  }
  const db = 20 * Math.log10(linear);
  const normalized = (db - MIN_DB) / (MAX_DB - MIN_DB);
  return Math.min(1, Math.max(0, normalized));
}
