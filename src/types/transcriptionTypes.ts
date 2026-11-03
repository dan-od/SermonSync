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
