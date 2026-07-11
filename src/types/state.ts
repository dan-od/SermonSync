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
}

export interface AudioPipelineState {
  inputDevice: AudioInputDevice | null;
  isCapturing: boolean;
  /** VAD sensitivity threshold, 0.0 - 1.0 */
  vadSensitivity: number;
  sampleRate: number;
  latencyMs: number;
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
  currentSlide: ProjectorSlide | null;
  overlayMode: OverlayMode;
  theme: VerseTheme;
  /** display id/name for HDMI output selection */
  outputDisplay: string | null;
  ndiEnabled: boolean;
}

// ---------------------------------------------------------------------------
// System configuration
// ---------------------------------------------------------------------------

export type UiTheme = "dark" | "light";

export interface SystemConfig {
  unitId: string;
  unitName: string;
  bibleVersion: string;
  theme: UiTheme;
  groqApiKey: string | null;
  groqEnabled: boolean;
}
