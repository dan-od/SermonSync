// ---------------------------------------------------------------------------
// Sidecar websocket payloads
// ---------------------------------------------------------------------------

export interface SidecarAckEvent {
  type: "ack";
  message: string;
}

export interface SidecarAudioLevelEvent {
  type: "audio_level";
  rms: number;
  peak: number;
}

export interface SidecarVadStateEvent {
  type: "vad_state";
  is_speech: boolean;
  confidence: number;
}

export interface SidecarAudioStateChangeEvent {
  type: "state_change";
  state: "silence" | "speech" | "worship";
  confidence: number;
}

export interface SidecarAudioErrorEvent {
  type: "audio_error";
  error: string;
  detail: string;
}

export interface SidecarTranscriptionEvent {
  type: "transcription";
  text: string;
  timestamp: number;
  is_final: boolean;
  confidence: number;
  language?: string;
  latency_ms?: number;
}

export interface SidecarSentenceEvent {
  type: "sentence";
  text: string;
  timestamp: number;
  context: string[];
}

export interface SidecarSuggestionResult {
  reference: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
  version: string;
  confidence: number;
  confidence_pct: number;
  stage: number;
  source_stages: number[];
}

export interface SidecarSuggestionsEvent {
  type: "suggestions";
  sentence: string;
  results: SidecarSuggestionResult[];
}

export interface SidecarContextUpdateEvent {
  type: "context_update";
  themes: string[];
  confidence: number;
}

export interface StageMetrics {
  avg_ms: number;
  last_ms: number;
  max_ms: number;
  errors: number;
  healthy: boolean;
}

export interface SidecarSystemStatusEvent {
  type: "system_status";
  uptime_seconds: number;
  latency_ms: number;
  latency_age_ms?: number | null;
  latency_avg_ms: number;
  latency_peak_ms: number;
  status: "idle" | "stable" | "degraded" | "alert";
  alert: boolean;
  pipeline_stages_healthy: boolean[];
  stages: Record<string, StageMetrics>;
}

/**
 * Dev-only live-feed test harness (SS-072): a file or YouTube URL is playing
 * through the live pipeline instead of the microphone.
 */
export interface SidecarTestFeedEvent {
  type: "test_feed";
  state: "idle" | "loading" | "playing" | "draining" | "stopped" | "error";
  title: string | null;
  source: string | null;
  /** Seconds into the source media. */
  position: number;
  start: number;
  end: number | null;
  speed: number;
  label?: string | null;
  captions?: string | null;
  run_dir?: string | null;
  report?: string | null;
  error?: string | null;
}

export type SidecarWsEvent =
  | SidecarTestFeedEvent
  | SidecarAckEvent
  | SidecarAudioLevelEvent
  | SidecarVadStateEvent
  | SidecarAudioStateChangeEvent
  | SidecarAudioErrorEvent
  | SidecarTranscriptionEvent
  | SidecarSentenceEvent
  | SidecarSuggestionsEvent
  | SidecarContextUpdateEvent
  | SidecarSystemStatusEvent;
