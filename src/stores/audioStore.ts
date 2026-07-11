/**
 * Audio pipeline store (SS-004 scaffold).
 *
 * Mirrors the Python sidecar audio state (device selection, capture, VAD,
 * latency). TODO(Dee): subscribe to the /ws/audio "audio_level" / "vad_state"
 * events and drive `status` transitions from them.
 */
import { create } from "zustand";

import type { AudioInputDevice, AudioPipelineState } from "../types/state";

interface AudioStore extends AudioPipelineState {
  setDevice: (device: AudioInputDevice | null) => void;
  setCapturing: (capturing: boolean) => void;
  setVadSensitivity: (value: number) => void;
  setLatency: (ms: number) => void;
  setStatus: (status: AudioPipelineState["status"]) => void;
  reset: () => void;
}

const initialState: AudioPipelineState = {
  inputDevice: null,
  isCapturing: false,
  vadSensitivity: 0.5,
  sampleRate: 16000,
  latencyMs: 0,
  status: "disconnected",
};

export const useAudioStore = create<AudioStore>((set) => ({
  ...initialState,

  // TODO(Dee): POST /api/audio/select-device when the device changes.
  setDevice: (inputDevice) => set({ inputDevice }),

  // TODO(Dee): POST /api/audio/start-capture | stop-capture.
  setCapturing: (isCapturing) =>
    set({ isCapturing, status: isCapturing ? "capturing" : "connected" }),

  // TODO(Dee): debounce + POST /api/audio/vad-sensitivity.
  setVadSensitivity: (vadSensitivity) => set({ vadSensitivity }),

  setLatency: (latencyMs) => set({ latencyMs }),

  setStatus: (status) => set({ status }),

  reset: () => set({ ...initialState }),
}));
