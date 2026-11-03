// ---------------------------------------------------------------------------
// Audio pipeline
// ---------------------------------------------------------------------------

export type AudioStatus =
  | "disconnected"
  | "connected"
  | "capturing"
  | "error";

export interface AudioInputDevice {
  index: number;
  name: string;
  channels: number;
  defaultSampleRate: number;
  isDefault?: boolean;
}

export interface AudioPipelineState {
  availableDevices: AudioInputDevice[];
  inputDevice: AudioInputDevice | null;
  inputChannel: number;
  isCapturing: boolean;
  /** VAD sensitivity threshold, 0.0 - 1.0 */
  vadSensitivity: number;
  sampleRate: number;
  latencyMs: number;
  levelRms: number;
  levelPeak: number;
  isSpeech: boolean;
  speechConfidence: number;
  acousticState: "silence" | "speech" | "worship";
  acousticConfidence: number;
  lastError: string | null;
  status: AudioStatus;
}
