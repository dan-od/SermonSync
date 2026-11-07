/**
 * Timings and copy for the SS-076 launch sequence.
 *
 * The numbers are the motion reference's, not guesses: a 4.5s floor so the
 * sequence always gets to finish its sentence, and a skip pill after 6s so an
 * operator is never trapped behind a slow model load.
 */
export const LAUNCH_EASE = "cubic-bezier(.2,.7,.2,1)";

/** The sequence plays for at least this long, however fast the engine is. */
export const FLOOR_MS = 4500;
/** Grace after the engine reports ready, so the last row is readable. */
export const READY_GRACE_MS = 300;
/** Skip appears if the operator is still waiting this far in. */
export const SKIP_DELAY_MS = 6000;

/** Absolute beat marks, in ms from the first frame. */
export const LAUNCH_MARKS = [
  { at: 400, action: "sound" },
  { at: 1100, action: "wordmark" },
  { at: 1700, action: "tagline" },
  { at: 1900, action: "boot" },
  { at: 3600, action: "stamp" },
] as const;

export type LaunchMarkAction = (typeof LAUNCH_MARKS)[number]["action"];

/** One tagline, in one place, fixed — reviewed for truth before it ships. */
export const LAUNCH_TAGLINE = "Scripture on screen as the Word is preached.";

/**
 * The boot rows. Labels are deliberately free of counts and model names: the
 * real ones are appended by `useBootStatus` once the sidecar has said them, so
 * the screen never claims a version count or a device it has not read.
 */
export const BOOT_STEPS = [
  { key: "engine", label: "starting sermonsync-ai engine" },
  { key: "bible", label: "opening bible database" },
  { key: "vad", label: "loading silero voice detection" },
  { key: "whisper", label: "loading whisper" },
  { key: "matcher", label: "indexing scripture matcher" },
  { key: "ready", label: "pipeline ready" },
] as const;

export type BootStepKey = (typeof BOOT_STEPS)[number]["key"];
export type BootStepState = "pending" | "active" | "done" | "err";

export interface BootStep {
  key: BootStepKey;
  label: string;
  state: BootStepState;
  /** Right-hand column: the step's duration once done, or a failure note. */
  meta?: string;
}

/** How often `/api/logs` and `/api/engine/status` are polled. */
export const BOOT_POLL_MS = 500;
/**
 * Total silence for this long — no log line, no process event, no HTTP answer —
 * is a failure worth showing. A model load alone is not: uvicorn has not bound
 * its port yet, so refused connections are expected for minutes.
 */
export const BOOT_TIMEOUT_MS = 30_000;

/** Shown in the unit stamp until `/api/engine/status` reports the real one. */
export const DEFAULT_ENGINE_VERSION = "3.1.0-fsq";

/**
 * Browser-only fallback: with no Tauri shell there is no sidecar to spawn, so
 * the rows walk the reference's own timing to keep the screen workable in
 * `npm run dev`. A real sidecar always overtakes it — progress is monotonic.
 */
export const BOOT_SIMULATED_TIMES = [0, 450, 900, 1300, 1750, 2050] as const;
