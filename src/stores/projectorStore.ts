/**
 * Projector store (SS-004 scaffold).
 *
 * Controls what is shown on the projector output (slide, overlay style, theme,
 * NDI/HDMI). External projector and NDI output remain outside this change.
 */
import { create } from "zustand";
import { DEFAULT_TRANSITIONS } from "../lib/transitions";
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

export const DEFAULT_LOGO: LogoConfig = {
  src: null,
  fit: "contain",
};

interface ProjectorStore extends ProjectorState {
  setPreview: (slide: ProjectorSlide | null) => void;
  sendLive: (slide: ProjectorSlide) => void;
  setPreviewMedia: (media: ProjectorMedia | null) => void;
  sendLiveMedia: (media: ProjectorMedia) => void;
  setLiveAudioWaveform: (path: string, peaks: number[], duration: number, error: string | null, minPeaks?: number[], maxPeaks?: number[]) => void;
  setLiveAudioPlaybackError: (path: string, error: string | null) => void;
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

function sameDisplays(previous: DisplayInfo[], next: DisplayInfo[]): boolean {
  return previous.length === next.length && previous.every((display, index) => {
    const other = next[index];
    return display.id === other.id
      && display.name === other.name
      && display.friendlyName === other.friendlyName
      && display.width === other.width
      && display.height === other.height
      && display.refreshHz === other.refreshHz
      && display.x === other.x
      && display.y === other.y
      && display.scaleFactor === other.scaleFactor
      && display.nativeX === other.nativeX
      && display.nativeY === other.nativeY
      && display.nativeWidth === other.nativeWidth
      && display.nativeHeight === other.nativeHeight
      && display.isPrimary === other.isPrimary
      && display.connected === other.connected;
  });
}

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
      livePlayback: { ...state.livePlayback, playing: true, looping: currentMedia.category === "videos", seekTime: null },
    })),

  setLiveAudioWaveform: (path, peaks, duration, error, minPeaks, maxPeaks) => set((state) => {
    const media = state.liveMedia;
    if (!media || media.category !== "audio" || media.path !== path || media.audioWaveform !== undefined) return state;
    return {
      liveMedia: {
        ...media,
        audioWaveform: peaks,
        ...(minPeaks ? { audioWaveformMin: minPeaks } : {}),
        ...(maxPeaks ? { audioWaveformMax: maxPeaks } : {}),
        audioDuration: duration,
        audioWaveformError: error,
      },
    };
  }),

  setLiveAudioPlaybackError: (path, error) => set((state) => {
    const media = state.liveMedia;
    if (!media || media.category !== "audio" || media.path !== path || media.audioPlaybackError === error) return state;
    return { liveMedia: { ...media, audioPlaybackError: error } };
  }),

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

  setAvailableDisplays: (availableDisplays) => set((state) =>
    sameDisplays(state.availableDisplays, availableDisplays) ? state : { availableDisplays }),

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
