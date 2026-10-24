import type { TransitionCategory, TransitionEasing, TransitionEffect, TransitionSetting, TransitionsConfig } from "../types/state";

export const TRANSITION_CATEGORIES: TransitionCategory[] = ["scriptures", "songs", "layout", "logo", "black", "clear"];

export const TRANSITION_EFFECTS: TransitionEffect[] = ["cut", "fade", "slide-left", "slide-right", "slide-up", "slide-down", "zoom-in", "zoom-out"];

export const TRANSITION_EASINGS: TransitionEasing[] = ["ease", "linear", "ease-in", "ease-out", "ease-in-out", "spring"];

const EASING_CSS: Record<TransitionEasing, string> = {
  ease: "ease",
  linear: "linear",
  "ease-in": "ease-in",
  "ease-out": "ease-out",
  "ease-in-out": "ease-in-out",
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
};

const FADE: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];
const from = (transform: string): Keyframe[] => [{ opacity: 0, transform }, { opacity: 1, transform: "none" }];

/** Compositor-only keyframes (opacity/transform) for each entering effect. */
const EFFECT_KEYFRAMES: Record<TransitionEffect, Keyframe[] | null> = {
  cut: null,
  fade: FADE,
  "slide-left": from("translate3d(8%, 0, 0)"),
  "slide-right": from("translate3d(-8%, 0, 0)"),
  "slide-up": from("translate3d(0, 8%, 0)"),
  "slide-down": from("translate3d(0, -8%, 0)"),
  "zoom-in": from("scale(0.94)"),
  "zoom-out": from("scale(1.06)"),
};

export const isInstant = (setting?: TransitionSetting) => !setting || setting.effect === "cut" || setting.durationMs <= 0;

export function enterAnimation(setting?: TransitionSetting): { keyframes: Keyframe[]; options: KeyframeAnimationOptions } | null {
  if (!setting || isInstant(setting)) return null;
  const keyframes = EFFECT_KEYFRAMES[setting.effect];
  return keyframes ? { keyframes, options: { duration: setting.durationMs, easing: EASING_CSS[setting.easing] ?? "ease" } } : null;
}

/** CSS `transition` value for opacity-only changes (clear/black/logo/overlay). */
export function fadeTransition(setting?: TransitionSetting): string {
  return isInstant(setting) ? "none" : `opacity ${setting!.durationMs}ms ${EASING_CSS[setting!.easing] ?? "ease"}`;
}

export function getTransitionSetting(config: TransitionsConfig, category: TransitionCategory): TransitionSetting {
  return config.enabled === false ? CUT : config[category];
}

const t = (effect: TransitionEffect, durationMs: number, easing: TransitionEasing = "ease-in-out"): TransitionSetting => ({ effect, durationMs, easing });
const CUT = t("cut", 0, "linear");

const uniform = (live: TransitionSetting, clear: TransitionSetting = live): TransitionsConfig => ({
  enabled: true,
  scriptures: live,
  songs: live,
  layout: live,
  logo: live,
  black: CUT,
  clear,
});

export const DEFAULT_TRANSITIONS: TransitionsConfig = uniform(t("fade", 350));

export const TRANSITION_PRESETS: { id: string; label: string; config: TransitionsConfig }[] = [
  { id: "default", label: "Default", config: DEFAULT_TRANSITIONS },
  { id: "cinematic", label: "Cinematic", config: { ...uniform(t("fade", 600), t("fade", 500)), layout: t("slide-up", 700, "spring"), logo: t("zoom-in", 800) } },
  { id: "punchy", label: "Punchy", config: uniform(t("slide-left", 220, "ease-out"), t("fade", 150, "ease-out")) },
  { id: "broadcast", label: "Broadcast", config: uniform(t("fade", 250, "linear")) },
  { id: "cut", label: "Hard Cut", config: uniform(CUT) },
];

const LEGACY_EFFECTS: Record<string, TransitionEffect> = {
  dissolve: "fade",
  "push-left": "slide-left",
  "wipe-left": "slide-left",
  "push-right": "slide-right",
  "wipe-right": "slide-right",
  "push-up-crossfade": "slide-up",
};

/** Merges saved settings over defaults, migrating legacy effects and dropping removed fields. */
export function normalizeTransitions(saved: unknown): TransitionsConfig {
  const source = (saved && typeof saved === "object" ? saved : {}) as Record<string, Partial<TransitionSetting> | undefined> & { enabled?: unknown };
  const out: TransitionsConfig = { ...DEFAULT_TRANSITIONS, enabled: typeof source.enabled === "boolean" ? source.enabled : DEFAULT_TRANSITIONS.enabled };
  for (const category of TRANSITION_CATEGORIES) {
    const entry = source[category];
    if (!entry || typeof entry !== "object") continue;
    const effect = LEGACY_EFFECTS[entry.effect as string] ?? entry.effect;
    out[category] = {
      effect: TRANSITION_EFFECTS.includes(effect as TransitionEffect) ? (effect as TransitionEffect) : DEFAULT_TRANSITIONS[category].effect,
      durationMs: typeof entry.durationMs === "number" && entry.durationMs >= 0 ? entry.durationMs : DEFAULT_TRANSITIONS[category].durationMs,
      easing: TRANSITION_EASINGS.includes(entry.easing as TransitionEasing) ? (entry.easing as TransitionEasing) : DEFAULT_TRANSITIONS[category].easing,
    };
  }
  return out;
}
