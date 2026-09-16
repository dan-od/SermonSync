/**
 * Audio pipeline store (SS-004 scaffold).
 *
 * Mirrors the Python sidecar audio state (device selection, capture, VAD,
 * latency), and holds the live input meter fed by the /ws/audio "audio_level"
 * and "vad_state" events.
 *
 * The meter lives here rather than in App state so that ~10 level events per
 * second re-render only the status bar, not the whole app.
 */
import { create } from "zustand";

import type { AudioInputDevice, AudioPipelineState } from "../types/state";

/** Number of bars in the status-bar meter (oldest → newest, left → right). */
export const METER_BARS = 8;

/**
 * Map RMS to a 0..1 bar height on a dB scale, so quiet speech is visible
 * instead of hugging the floor. -60 dBFS (rms 0.001) reads as empty, 0 dBFS
 * as full; normal speech (~rms 0.03, -30 dB) lands mid-scale.
 */
export function rmsToLevel(rms: number): number {
  if (!(rms > 0)) return 0;
  const db = 20 * Math.log10(rms);
  return Math.min(1, Math.max(0, (db + 60) / 60));
}

interface AudioStore extends AudioPipelineState {
  setAvailableDevices: (devices: AudioInputDevice[]) => void;
  /** Rolling meter history, oldest first, derived from setAudioLevel. */
  levels: number[];
  /** Timestamp (ms) of the last level event, for decaying a stalled meter. */
  lastLevelAt: number;
  decayMeter: () => void;
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

const emptyMeter = () => new Array<number>(METER_BARS).fill(0);

export const useAudioStore = create<AudioStore>((set, get) => ({
  ...initialState,
  levels: emptyMeter(),
  lastLevelAt: 0,

  // Levels stop arriving when capture stops; let the meter fall to zero
  // instead of freezing on its last reading.
  decayMeter: () => {
    const { lastLevelAt, levels } = get();
    if (Date.now() - lastLevelAt < 400) return;
    if (levels.every((v) => v === 0)) return;
    set({ levels: [...levels.slice(1), 0], isSpeech: false });
  },

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

  // Single entry point for the meter: the sidecar bridge's "audio_level"
  // event updates both the raw scalars (consumed by computeAudioAmplitude and
  // mic-mute detection) and the dB-scaled rolling history the bars render.
  setAudioLevel: (levelRms, levelPeak) =>
    set((state) => ({
      levelRms,
      levelPeak,
      status: "capturing",
      isCapturing: true,
      levels: [...state.levels.slice(1), rmsToLevel(levelRms)],
      lastLevelAt: Date.now(),
    })),

  setVadState: (isSpeech, speechConfidence) => set({ isSpeech, speechConfidence }),

  setAcousticState: (acousticState, acousticConfidence) => set({ acousticState, acousticConfidence }),

  setAudioError: (lastError) =>
    set({ lastError, status: "error", isCapturing: false }),

  clearAudioError: () => set({ lastError: null }),

  setStatus: (status) => set({ status }),

  reset: () => set({ ...initialState, levels: emptyMeter(), isSpeech: false, lastLevelAt: 0 }),
}));
