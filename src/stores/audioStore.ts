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
  setAvailableDevices: (devices: AudioInputDevice[]) => void;
  setDevice: (device: AudioInputDevice | null) => void;
  setDeviceByName: (name: string) => void;
  setChannel: (channel: number) => void;
  setCapturing: (capturing: boolean) => void;
  setVadSensitivity: (value: number) => void;
  setLatency: (ms: number) => void;
  setAudioLevel: (rms: number, peak: number) => void;
  setVadState: (isSpeech: boolean, confidence: number) => void;
  setAcousticState: (state: AudioPipelineState["acousticState"], confidence: number) => void;
  setAudioError: (detail: string) => void;
  clearAudioError: () => void;
  setStatus: (status: AudioPipelineState["status"]) => void;
  reset: () => void;
}

const initialState: AudioPipelineState = {
  availableDevices: [],
  inputDevice: null,
  inputChannel: 1,
  isCapturing: false,
  vadSensitivity: 0.5,
  sampleRate: 16000,
  latencyMs: 0,
  levelRms: 0,
  levelPeak: 0,
  isSpeech: false,
  speechConfidence: 0,
  acousticState: "silence",
  acousticConfidence: 0,
  lastError: null,
  status: "disconnected",
};

export const useAudioStore = create<AudioStore>((set) => ({
  ...initialState,

  setAvailableDevices: (availableDevices) =>
    set((s) => {
      const stillSelected = s.inputDevice
        ? availableDevices.find((d) => d.name === s.inputDevice?.name || d.index === s.inputDevice?.index) ?? null
        : null;
      return { availableDevices, inputDevice: stillSelected };
    }),

  // TODO(Dee): POST /api/audio/select-device when the device changes.
  setDevice: (inputDevice) =>
    set({
      inputDevice,
      inputChannel: 1,
      sampleRate: inputDevice?.defaultSampleRate ?? 16000,
      status: inputDevice ? "connected" : "disconnected",
    }),

  setDeviceByName: (name) =>
    set((s) => {
      const selected = s.availableDevices.find((d) => d.name === name) ?? null;
      if (!selected) {
        return {};
      }
      return {
        inputDevice: selected,
        inputChannel: 1,
        sampleRate: selected.defaultSampleRate,
        status: "connected",
      };
    }),

  // TODO(Dee): POST /api/audio/start-capture | stop-capture.
  setChannel: (inputChannel) => set({ inputChannel }),

  setCapturing: (isCapturing) =>
    set((s) => ({
      isCapturing,
      status: isCapturing ? "capturing" : s.inputDevice ? "connected" : "disconnected",
    })),

  // TODO(Dee): debounce + POST /api/audio/vad-sensitivity.
  setVadSensitivity: (vadSensitivity) => set({ vadSensitivity }),

  setLatency: (latencyMs) => set({ latencyMs }),

  setAudioLevel: (levelRms, levelPeak) =>
    set({ levelRms, levelPeak, status: "capturing", isCapturing: true }),

  setVadState: (isSpeech, speechConfidence) => set({ isSpeech, speechConfidence }),

  setAcousticState: (acousticState, acousticConfidence) => set({ acousticState, acousticConfidence }),

  setAudioError: (lastError) =>
    set({ lastError, status: "error", isCapturing: false }),

  clearAudioError: () => set({ lastError: null }),

  setStatus: (status) => set({ status }),

  reset: () => set({ ...initialState }),
}));
