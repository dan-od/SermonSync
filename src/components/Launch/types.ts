/**
 * Shared types for the Launch intro sequence (SS launch/splash screen).
 *
 * This screen is shown once on app start, before the AuthGate. It has no
 * relation to the Settings panel — it only borrows the same "modular
 * sub-components in one folder" convention used there.
 */
export interface LaunchAnimationSettings {
  /** Multiplier for the wave animation speed, e.g. 1.0 */
  waveSpeed: number;
  /** 0.0 to 1.5 */
  glowIntensity: number;
  /** 4 to 8 strands */
  strandCount: number;
  /** CSS color string used for the ambient glow + wave strokes */
  ambientGlowColor: string;
}

// Mirrors --color-primary in tokens.css (#7b2ff7). Kept as a literal here
// because the canvas 2D context needs a concrete color string, not a CSS
// custom property reference.
export const DEFAULT_LAUNCH_SETTINGS: LaunchAnimationSettings = {
  waveSpeed: 0.95,
  glowIntensity: 1.0,
  strandCount: 6,
  ambientGlowColor: "#7b2ff7",
};
