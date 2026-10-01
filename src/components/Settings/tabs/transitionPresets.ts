import type {
  SettingsPanelState,
  TransitionEasing,
  TransitionEffect,
} from "../types";

export type TransitionCategory = "scriptures" | "songs" | "layout" | "logo" | "black" | "clear";

export const EFFECT_OPTIONS: { value: TransitionEffect; label: string }[] = [
  { value: "fade", label: "Fade (Dissolve)" },
  { value: "dissolve", label: "Soft Cross-Dissolve" },
  { value: "slide-left", label: "Slide Left" },
  { value: "slide-right", label: "Slide Right" },
  { value: "slide-up", label: "Slide Up" },
  { value: "slide-down", label: "Slide Down" },
  { value: "push-left", label: "Push Left" },
  { value: "push-right", label: "Push Right" },
  { value: "push-up-crossfade", label: "Push Up (Crossfade)" },
  { value: "wipe-left", label: "Wipe Left" },
  { value: "wipe-right", label: "Wipe Right" },
  { value: "zoom-in", label: "Zoom In" },
  { value: "zoom-out", label: "Zoom Out" },
  { value: "cut", label: "Instant Cut (No Anim)" },
];

export const EASING_OPTIONS: { value: TransitionEasing; label: string }[] = [
  { value: "ease-in-out", label: "Ease In-Out (Smooth)" },
  { value: "ease", label: "Ease (Standard)" },
  { value: "ease-out", label: "Ease Out (Decelerate)" },
  { value: "ease-in", label: "Ease In (Accelerate)" },
  { value: "linear", label: "Linear (Uniform Speed)" },
  { value: "spring", label: "Spring (Elastic Bounce)" },
];

export type TransitionPresetId = "cinematic" | "punchy" | "broadcast" | "cut" | "default";

/** Full per-category transition profile for a global preset. */
export function getTransitionPreset(preset: TransitionPresetId): SettingsPanelState["transitions"] {
  let next: SettingsPanelState["transitions"];
  if (preset === "cinematic") {
    next = {
      scriptures: { effect: "fade", durationMs: 500, easing: "ease-in-out", crossfade: true, motionBlur: false },
      songs: { effect: "dissolve", durationMs: 450, easing: "ease-in-out", crossfade: true, motionBlur: false },
      layout: { effect: "dissolve", durationMs: 500, easing: "ease-in-out", crossfade: true, motionBlur: false },
      logo: { effect: "zoom-in", durationMs: 600, easing: "ease-out", crossfade: true, motionBlur: true },
      black: { effect: "fade", durationMs: 400, easing: "linear", crossfade: true, motionBlur: false },
      clear: { effect: "dissolve", durationMs: 350, easing: "ease-out", crossfade: true, motionBlur: false },
    };
  } else if (preset === "punchy") {
    next = {
      scriptures: { effect: "slide-left", durationMs: 300, easing: "spring", crossfade: true, motionBlur: true },
      songs: { effect: "push-left", durationMs: 280, easing: "spring", crossfade: true, motionBlur: true },
      layout: { effect: "zoom-in", durationMs: 320, easing: "ease-out", crossfade: true, motionBlur: true },
      logo: { effect: "zoom-in", durationMs: 350, easing: "ease-out", crossfade: true, motionBlur: true },
      black: { effect: "slide-down", durationMs: 250, easing: "ease-out", crossfade: false, motionBlur: true },
      clear: { effect: "slide-up", durationMs: 250, easing: "ease-out", crossfade: true, motionBlur: false },
    };
  } else if (preset === "broadcast") {
    next = {
      scriptures: { effect: "wipe-left", durationMs: 400, easing: "ease-out", crossfade: true, motionBlur: false },
      songs: { effect: "wipe-left", durationMs: 350, easing: "ease-out", crossfade: true, motionBlur: false },
      layout: { effect: "fade", durationMs: 400, easing: "ease-in-out", crossfade: true, motionBlur: false },
      logo: { effect: "fade", durationMs: 400, easing: "ease-in-out", crossfade: true, motionBlur: false },
      black: { effect: "cut", durationMs: 0, easing: "linear", crossfade: false, motionBlur: false },
      clear: { effect: "fade", durationMs: 300, easing: "ease-out", crossfade: true, motionBlur: false },
    };
  } else if (preset === "cut") {
    next = {
      scriptures: { effect: "cut", durationMs: 0, easing: "linear", crossfade: false, motionBlur: false },
      songs: { effect: "cut", durationMs: 0, easing: "linear", crossfade: false, motionBlur: false },
      layout: { effect: "cut", durationMs: 0, easing: "linear", crossfade: false, motionBlur: false },
      logo: { effect: "cut", durationMs: 0, easing: "linear", crossfade: false, motionBlur: false },
      black: { effect: "cut", durationMs: 0, easing: "linear", crossfade: false, motionBlur: false },
      clear: { effect: "cut", durationMs: 0, easing: "linear", crossfade: false, motionBlur: false },
    };
  } else {
    next = {
      scriptures: { effect: "fade", durationMs: 350, easing: "ease-in-out", crossfade: true, motionBlur: false },
      songs: { effect: "slide-left", durationMs: 400, easing: "ease", crossfade: true, motionBlur: true },
      layout: { effect: "dissolve", durationMs: 400, easing: "ease-in-out", crossfade: true, motionBlur: false },
      logo: { effect: "zoom-in", durationMs: 500, easing: "ease-out", crossfade: true, motionBlur: true },
      black: { effect: "fade", durationMs: 250, easing: "linear", crossfade: false, motionBlur: false },
      clear: { effect: "dissolve", durationMs: 300, easing: "ease-out", crossfade: true, motionBlur: false },
    };
  }
  return next;
}
