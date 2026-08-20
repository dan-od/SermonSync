/**
 * SermonSync shared state interfaces (SS-004).
 *
 * These are the canonical state shapes for the whole app. The Python sidecar's
 * WebSocket/REST payloads are designed to map onto these, so backend work can
 * reference them directly. Dee owns the store implementations that consume
 * these types.
 */

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export type SessionStatus = "idle" | "active" | "paused" | "ended";

export interface SessionState {
  id: string | null;
  status: SessionStatus;
  /** epoch ms when the session started, or null if not started */
  startTime: number | null;
  /** elapsed seconds of active session time */
  elapsed: number;
  unitId: string | null;
}

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

// ---------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------

export type TranscriptionEventType = "speech" | "worship" | "silence";

export interface TranscriptionEvent {
  id: string;
  /** epoch ms */
  timestamp: number;
  text: string;
  type: TranscriptionEventType;
  /** 0.0 - 1.0 */
  confidence: number;
  isFinal?: boolean;
  language?: string;
  latencyMs?: number;
  context?: string[];
}

export interface TranscriptItem {
  id: string;
  timestamp: string;
  speaker: string;
  text: string;
  matches: string[];
}

export interface TranscriptionState {
  events: TranscriptionEvent[];
  timeline: TranscriptItem[];
  latestPartial: string;
  contextWindow: string[];
  themes: string[];
  themeConfidence: number;
}

// ---------------------------------------------------------------------------
// Scripture suggestions
// ---------------------------------------------------------------------------

export interface ScriptureReference {
  book: string;
  chapter: number;
  verse: number;
}

/** Which pipeline stage produced a suggestion (1=Trie … 4=Neural). */
export type PipelineStage = 1 | 2 | 3 | 4;

export type SuggestionStatus = "pending" | "sent" | "dismissed" | "edited";

export interface SuggestionCard {
  id: string;
  reference: ScriptureReference;
  text: string;
  /** 0.0 - 1.0 */
  confidence: number;
  pipelineStage: PipelineStage;
  status: SuggestionStatus;
  /** e.g. "KJV" */
  version: string;
  /** theme/context labels, e.g. ["DIVINE SALVATION", "ETERNAL HOPE"] */
  themes: string[];
  /** epoch ms at ingest/creation time; used for chronological deck ordering */
  createdAt?: number;
  pinned?: boolean;
}

// ---------------------------------------------------------------------------
// Projector
// ---------------------------------------------------------------------------

export type OverlayMode = "widescreen" | "lower-third";
export type VerseTheme = "cup" | "cross" | "crown";

export interface ProjectorSlide {
  reference: ScriptureReference;
  text: string;
  version: string;
}

export interface ProjectorState {
  isLive: boolean;
  previewSlide: ProjectorSlide | null;
  liveSlide: ProjectorSlide | null;
  currentSlide: ProjectorSlide | null;
  overlayMode: OverlayMode;
  theme: VerseTheme;
  feedOverride: "live" | "logo" | "black" | "clear";
  /** display id/name for HDMI output selection */
  outputDisplay: string | null;
  ndiEnabled: boolean;
}

// ---------------------------------------------------------------------------
// System configuration
// ---------------------------------------------------------------------------

export type UiTheme = "dark" | "light";

export interface BibleVersionSummary {
  abbreviation: string;
  name: string;
  verse_count: number;
  available: boolean;
}

export type ModelProviderId = "groq" | "openai" | "anthropic" | "gemini";

export interface SystemConfig {
  unitId: string;
  unitName: string;
  bibleVersion: string;
  bibleVersions: BibleVersionSummary[];
  theme: UiTheme;
  groqApiKey: string | null;
  groqEnabled: boolean;
  /** API keys for non-Groq providers; Groq keeps its own dedicated fields above. */
  modelProviderKeys: Partial<Record<Exclude<ModelProviderId, "groq">, string>>;
  defaultModelProvider: ModelProviderId | null;
}

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
  latency_avg_ms: number;
  latency_peak_ms: number;
  status: "idle" | "stable" | "degraded" | "alert";
  alert: boolean;
  pipeline_stages_healthy: boolean[];
  stages: Record<string, StageMetrics>;
}

export type SidecarWsEvent =
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
