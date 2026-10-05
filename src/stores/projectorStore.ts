/**
 * Projector store (SS-004 scaffold).
 *
 * Controls what is shown on the projector output (slide, overlay style, theme,
 * NDI/HDMI). External projector and NDI output remain outside this change.
 */
import { create } from "zustand";

import type {
  OverlayMode,
  ProjectorSlide,
  ProjectorState,
  TransitionsConfig,
  VerseTheme,
} from "../types/state";

export const DEFAULT_TRANSITIONS: TransitionsConfig = {
  scriptures: {
    effect: "fade",
    durationMs: 350,
    easing: "ease-in-out",
    crossfade: true,
    motionBlur: false,
  },
  songs: {
    effect: "slide-left",
    durationMs: 400,
    easing: "ease",
    crossfade: true,
    motionBlur: true,
  },
  layout: {
    effect: "dissolve",
    durationMs: 400,
    easing: "ease-in-out",
    crossfade: true,
    motionBlur: false,
  },
  logo: {
    effect: "zoom-in",
    durationMs: 500,
    easing: "ease-out",
    crossfade: true,
    motionBlur: true,
  },
  black: {
    effect: "fade",
    durationMs: 250,
    easing: "linear",
    crossfade: false,
    motionBlur: false,
  },
  clear: {
    effect: "dissolve",
    durationMs: 300,
    easing: "ease-out",
    crossfade: true,
    motionBlur: false,
  },
};

interface ProjectorStore extends ProjectorState {
  setPreview: (slide: ProjectorSlide | null) => void;
  sendLive: (slide: ProjectorSlide) => void;
  clearScreen: () => void;
  setOverlayMode: (mode: OverlayMode) => void;
  setTheme: (theme: VerseTheme) => void;
  setFeedOverride: (mode: ProjectorState["feedOverride"]) => void;
  setOutputDisplay: (display: string | null) => void;
  toggleLive: (isLive?: boolean) => void;
  setNdiEnabled: (enabled: boolean) => void;
  setTransitions: (transitions: TransitionsConfig) => void;
  reset: () => void;
}

const initialState: ProjectorState = {
  isLive: false,
  previewSlide: null,
  liveSlide: null,
  currentSlide: null,
  overlayMode: "widescreen",
  theme: "cross",
  feedOverride: "live",
  outputDisplay: (() => {
    try { return typeof window === "undefined" ? null : window.localStorage.getItem("sermonsync-output-display"); }
    catch { return null; }
  })(),
  ndiEnabled: false,
  transitions: DEFAULT_TRANSITIONS,
};

export const useProjectorStore = create<ProjectorStore>((set) => ({
  ...initialState,

  setPreview: (previewSlide) => set({ previewSlide }),

  // TODO(Dee): render `slide` to the projector window and mark it live.
  sendLive: (currentSlide) =>
    set({ currentSlide, liveSlide: currentSlide, isLive: true }),

  clearScreen: () =>
    set({ currentSlide: null, liveSlide: null, isLive: false }),

  setOverlayMode: (overlayMode) => set({ overlayMode }),

  setTheme: (theme) => set({ theme }),

  setFeedOverride: (feedOverride) => set({ feedOverride }),

  setOutputDisplay: (outputDisplay) => {
    try {
      if (outputDisplay) window.localStorage.setItem("sermonsync-output-display", outputDisplay);
      else window.localStorage.removeItem("sermonsync-output-display");
    } catch { /* Projection still works if settings storage is unavailable. */ }
    set({ outputDisplay });
  },

  toggleLive: (isLive) =>
    set((s) => ({ isLive: isLive ?? !s.isLive })),

  // TODO(Dee): start/stop the NDI sender in the Rust backend.
  setNdiEnabled: (ndiEnabled) => set({ ndiEnabled }),

  setTransitions: (transitions) => set({ transitions }),

  reset: () => set({ ...initialState }),
}));
