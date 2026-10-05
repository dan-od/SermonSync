/**
 * Projector store (SS-004 scaffold).
 *
 * Controls what is shown on the projector output (slide, overlay style, theme,
 * NDI/HDMI). External projector and NDI output remain outside this change.
 */
import { create } from "zustand";
import type { OverlayDefinition } from "../types/overlays";

import type {
  DisplayInfo,
  LogoConfig,
  OverlayMode,
  ProjectorSlide,
  ProjectorMedia,
  ProjectorState,
  ProjectorOutputStatus,
  ProjectorPlaybackState,
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

export const DEFAULT_LOGO: LogoConfig = {
  src: null,
  fit: "contain",
};

interface ProjectorStore extends ProjectorState {
  setPreview: (slide: ProjectorSlide | null) => void;
  sendLive: (slide: ProjectorSlide) => void;
  setPreviewMedia: (media: ProjectorMedia | null) => void;
  sendLiveMedia: (media: ProjectorMedia) => void;
  toggleOverlay: (overlay: OverlayDefinition) => void;
  updateActiveOverlay: (overlay: OverlayDefinition) => void;
  removeActiveOverlay: (id: string) => void;
  clearScreen: () => void;
  setOverlayMode: (mode: OverlayMode) => void;
  setTheme: (theme: VerseTheme) => void;
  setFeedOverride: (mode: ProjectorState["feedOverride"]) => void;
  setOutputDisplay: (display: string | null) => void;
  setAvailableDisplays: (displays: DisplayInfo[]) => void;
  selectDisplay: (displayId: string | null) => void;
  setOutputStatus: (status: ProjectorOutputStatus) => void;
  toggleLive: (isLive?: boolean) => void;
  setNdiEnabled: (enabled: boolean) => void;
  setTransitions: (transitions: TransitionsConfig) => void;
  setLogo: (logo: LogoConfig) => void;
  setLivePlayback: (patch: Partial<Pick<ProjectorPlaybackState, "playing" | "looping">>) => void;
  seekLivePlayback: (time: number) => void;
  reset: () => void;
}

const initialState: ProjectorState = {
  isLive: false,
  previewSlide: null,
  liveSlide: null,
  previewMedia: null,
  liveMedia: null,
  currentSlide: null,
  currentMedia: null,
  activeOverlays: [],
  overlayMode: "widescreen",
  theme: "cross",
  feedOverride: "live",
  outputDisplay: null,
  availableDisplays: [],
  selectedDisplayId: null,
  outputStatus: "closed",
  ndiEnabled: false,
  transitions: DEFAULT_TRANSITIONS,
  logo: DEFAULT_LOGO,
  livePlayback: { playing: true, looping: true, seekTime: null, seekRevision: 0 },
};

export const useProjectorStore = create<ProjectorStore>((set) => ({
  ...initialState,

  setPreview: (previewSlide) => set({ previewSlide, previewMedia: null }),

  // TODO(Dee): render `slide` to the projector window and mark it live.
  sendLive: (currentSlide) =>
    set((state) => ({
      currentSlide, liveSlide: currentSlide, currentMedia: null, liveMedia: null, isLive: true,
      livePlayback: { ...state.livePlayback, playing: true, seekTime: null },
    })),

  setPreviewMedia: (previewMedia) => set({ previewMedia, previewSlide: null }),

  sendLiveMedia: (currentMedia) =>
    set((state) => ({
      currentMedia, liveMedia: currentMedia, currentSlide: null, liveSlide: null, isLive: true,
      livePlayback: { ...state.livePlayback, playing: true, seekTime: null },
    })),

  toggleOverlay: (overlay) => set((state) => {
    const activeOverlays = state.activeOverlays.some((entry) => entry.definition.id === overlay.id)
      ? []
      : [{ definition: overlay, startedAt: Date.now() }];
    return { activeOverlays, isLive: activeOverlays.length > 0 || state.liveSlide !== null || state.liveMedia !== null };
  }),

  updateActiveOverlay: (overlay) => set((state) => ({
    activeOverlays: state.activeOverlays.map((entry) => entry.definition.id === overlay.id
      ? { ...entry, definition: overlay }
      : entry),
  })),

  removeActiveOverlay: (id) => set((state) => {
    const activeOverlays = state.activeOverlays.filter((entry) => entry.definition.id !== id);
    return { activeOverlays, isLive: activeOverlays.length > 0 || state.liveSlide !== null || state.liveMedia !== null };
  }),

  clearScreen: () =>
    set({ currentSlide: null, liveSlide: null, currentMedia: null, liveMedia: null, activeOverlays: [], isLive: false }),

  setOverlayMode: (overlayMode) => set({ overlayMode }),

  setTheme: (theme) => set({ theme }),

  setFeedOverride: (feedOverride) => set({ feedOverride }),

  setOutputDisplay: (outputDisplay) => set({ outputDisplay, selectedDisplayId: outputDisplay }),

  setAvailableDisplays: (availableDisplays) => set({ availableDisplays }),

  selectDisplay: (selectedDisplayId) => set({ selectedDisplayId, outputDisplay: selectedDisplayId }),

  setOutputStatus: (outputStatus) => set({ outputStatus }),

  toggleLive: (isLive) =>
    set((s) => ({ isLive: isLive ?? !s.isLive })),

  // TODO(Dee): start/stop the NDI sender in the Rust backend.
  setNdiEnabled: (ndiEnabled) => set({ ndiEnabled }),

  setTransitions: (transitions) => set({ transitions }),

  setLogo: (logo) => set({ logo }),

  setLivePlayback: (patch) => set((state) => ({ livePlayback: { ...state.livePlayback, ...patch } })),

  seekLivePlayback: (time) => {
    if (!Number.isFinite(time) || time < 0) return;
    set((state) => ({ livePlayback: { ...state.livePlayback, seekTime: time, seekRevision: state.livePlayback.seekRevision + 1 } }));
  },

  reset: () => set({ ...initialState }),
}));
