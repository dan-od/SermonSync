import type { ActiveOverlay } from "./overlays";
import type { ScriptureReference } from "./suggestionTypes";

// ---------------------------------------------------------------------------
// Projector
// ---------------------------------------------------------------------------

export type OverlayMode = "widescreen" | "lower-third" | "split-screen";
export type VerseTheme = "cup" | "cross" | "crown";

/** "contain" preserves the logo's aspect ratio; "stretch" fills the full 1920x1080 canvas. */
export type LogoFit = "contain" | "stretch";

export interface LogoConfig {
  src: string | null;
  fit: LogoFit;
}

export type TransitionEffect =
  | "cut"
  | "fade"
  | "slide-left"
  | "slide-right"
  | "slide-up"
  | "slide-down"
  | "zoom-in"
  | "zoom-out";

export type TransitionEasing =
  | "ease"
  | "linear"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "spring";

export interface TransitionSetting {
  effect: TransitionEffect;
  durationMs: number;
  easing: TransitionEasing;
}

export type TransitionCategory = "scriptures" | "songs" | "layout" | "logo" | "black" | "clear";

export type TransitionsConfig = Record<TransitionCategory, TransitionSetting> & { enabled?: boolean };

export interface ProjectorSlide {
  reference: ScriptureReference;
  text: string;
  version: string;
}

export interface ProjectorMedia {
  path: string;
  name: string;
  category: "audio" | "images" | "videos";
  fit: "cover" | "contain" | "fill";
  opacity: number;
  audioSettings?: {
    volume: number;
    trimStart: number;
    trimEnd: number | null;
  };
  audioWaveform?: number[];
  audioWaveformMin?: number[];
  audioWaveformMax?: number[];
  audioDuration?: number;
  audioWaveformError?: string | null;
  audioPlaybackError?: string | null;
}

export interface DisplayInfo {
  /** Stable connector/name-based identifier, not the mutable display index. */
  id: string;
  name: string;
  friendlyName: string;
  width: number;
  height: number;
  refreshHz: number | null;
  x: number;
  y: number;
  scaleFactor: number;
  /** Logical/native bounds used to match GTK monitors on scaled Linux desktops. */
  nativeX?: number;
  nativeY?: number;
  nativeWidth?: number;
  nativeHeight?: number;
  isPrimary: boolean;
  connected: boolean;
}

export type ProjectorOutputStatus = "closed" | "ready" | "connected" | "disconnected" | "error";

export interface ProjectorPlaybackState {
  playing: boolean;
  looping: boolean;
  seekTime: number | null;
  seekRevision: number;
}

export interface ProjectorAudioProgress {
  path: string;
  time: number;
  duration: number;
}

export interface ProjectorOutputSnapshot {
  /** Monotonic delivery ID used to retry only snapshots the output has not received. */
  revision?: number;
  slide: ProjectorSlide | null;
  media: ProjectorMedia | null;
  overlays?: ActiveOverlay[];
  feedOverride: ProjectorState["feedOverride"];
  overlayMode: OverlayMode;
  theme: VerseTheme;
  transitions: TransitionsConfig;
  logo: LogoConfig;
  playback?: ProjectorPlaybackState;
}

export interface ProjectorState {
  isLive: boolean;
  previewSlide: ProjectorSlide | null;
  liveSlide: ProjectorSlide | null;
  previewMedia: ProjectorMedia | null;
  liveMedia: ProjectorMedia | null;
  currentSlide: ProjectorSlide | null;
  currentMedia: ProjectorMedia | null;
  activeOverlays: ActiveOverlay[];
  overlayMode: OverlayMode;
  theme: VerseTheme;
  feedOverride: "live" | "logo" | "black" | "clear";
  /** Display id/name retained for backwards-compatible persisted state. */
  outputDisplay: string | null;
  availableDisplays: DisplayInfo[];
  selectedDisplayId: string | null;
  outputStatus: ProjectorOutputStatus;
  ndiEnabled: boolean;
  transitions: TransitionsConfig;
  logo: LogoConfig;
  livePlayback: ProjectorPlaybackState;
}
