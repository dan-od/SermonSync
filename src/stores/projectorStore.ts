/**
 * Projector store (SS-004 scaffold).
 *
 * Controls what is shown on the projector output (slide, overlay style, theme,
 * NDI/HDMI). TODO(Dee): push slide changes to the Tauri projector window and
 * NDI sender; wire LIVE OUT toggle.
 */
import { create } from "zustand";

import type {
  OverlayMode,
  ProjectorSlide,
  ProjectorState,
  VerseTheme,
} from "../types/state";

interface ProjectorStore extends ProjectorState {
  sendLive: (slide: ProjectorSlide) => void;
  clearScreen: () => void;
  setOverlayMode: (mode: OverlayMode) => void;
  setTheme: (theme: VerseTheme) => void;
  setOutputDisplay: (display: string | null) => void;
  toggleLive: (isLive?: boolean) => void;
  setNdiEnabled: (enabled: boolean) => void;
  reset: () => void;
}

const initialState: ProjectorState = {
  isLive: false,
  currentSlide: null,
  overlayMode: "widescreen",
  theme: "cross",
  outputDisplay: null,
  ndiEnabled: false,
};

export const useProjectorStore = create<ProjectorStore>((set) => ({
  ...initialState,

  // TODO(Dee): render `slide` to the projector window and mark it live.
  sendLive: (currentSlide) => set({ currentSlide, isLive: true }),

  clearScreen: () => set({ currentSlide: null, isLive: false }),

  setOverlayMode: (overlayMode) => set({ overlayMode }),

  setTheme: (theme) => set({ theme }),

  setOutputDisplay: (outputDisplay) => set({ outputDisplay }),

  toggleLive: (isLive) =>
    set((s) => ({ isLive: isLive ?? !s.isLive })),

  // TODO(Dee): start/stop the NDI sender in the Rust backend.
  setNdiEnabled: (ndiEnabled) => set({ ndiEnabled }),

  reset: () => set({ ...initialState }),
}));
