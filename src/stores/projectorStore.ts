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
  VerseTheme,
} from "../types/state";

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
  outputDisplay: null,
  ndiEnabled: false,
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

  setOutputDisplay: (outputDisplay) => set({ outputDisplay }),

  toggleLive: (isLive) =>
    set((s) => ({ isLive: isLive ?? !s.isLive })),

  // TODO(Dee): start/stop the NDI sender in the Rust backend.
  setNdiEnabled: (ndiEnabled) => set({ ndiEnabled }),

  reset: () => set({ ...initialState }),
}));
