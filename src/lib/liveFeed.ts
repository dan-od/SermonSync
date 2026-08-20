/**
 * Live feed client — subscribes to the Python sidecar's WebSocket
 * (ws://localhost:8000/ws/audio) and dispatches typed events to callbacks.
 *
 * Auto-reconnects. Binary frames (raw PCM) are ignored by the UI. This is the
 * bridge that turns the dormant stores/panels into a live console.
 */
import { useEffect, useRef } from "react";

export const SIDECAR_HTTP = "http://127.0.0.1:8000";
export const SIDECAR_WS = "ws://127.0.0.1:8000/ws/audio";

export interface SentenceEvent {
  text: string;
  timestamp: number;
  context?: string[];
}

export interface TranscriptionEvent {
  text: string;
  timestamp: number;
  is_final: boolean;
  confidence: number;
}

export interface SuggestionResult {
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

export interface SuggestionsEvent {
  sentence?: string;
  results: SuggestionResult[];
}

export interface SessionPayload {
  id: string;
  status: string;
  unit_name?: string | null;
  elapsed_seconds?: number;
}

export interface SystemStatusEvent {
  latency_ms: number;
  uptime_seconds: number;
  status: string;
}

export interface LiveFeedHandlers {
  onConnected?: (connected: boolean) => void;
  onSentence?: (e: SentenceEvent) => void;
  onTranscription?: (e: TranscriptionEvent) => void;
  onSuggestions?: (e: SuggestionsEvent) => void;
  onSessionUpdate?: (session: SessionPayload | null) => void;
  onAudioLevel?: (e: { rms: number; peak: number }) => void;
  onVad?: (e: { is_speech: boolean; confidence: number }) => void;
  onStateChange?: (e: { state: string; confidence: number }) => void;
  onSystemStatus?: (e: SystemStatusEvent) => void;
  onContext?: (e: { themes: string[]; confidence: number }) => void;
  onError?: (e: { error: string; detail?: string }) => void;
}

type RawMessage = { type?: string } & Record<string, unknown>;

export function useLiveFeed(handlers: LiveFeedHandlers, url: string = SIDECAR_WS): void {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const dispatch = (msg: RawMessage) => {
      const h = handlersRef.current;
      switch (msg.type) {
        case "sentence":
          h.onSentence?.(msg as unknown as SentenceEvent);
          break;
        case "transcription":
          h.onTranscription?.(msg as unknown as TranscriptionEvent);
          break;
        case "suggestions":
          h.onSuggestions?.(msg as unknown as SuggestionsEvent);
          break;
        case "session_update":
          h.onSessionUpdate?.((msg.session as SessionPayload | null) ?? null);
          break;
        case "audio_level":
          h.onAudioLevel?.(msg as unknown as { rms: number; peak: number });
          break;
        case "vad_state":
          h.onVad?.(msg as unknown as { is_speech: boolean; confidence: number });
          break;
        case "state_change":
          h.onStateChange?.(msg as unknown as { state: string; confidence: number });
          break;
        case "system_status":
          h.onSystemStatus?.(msg as unknown as SystemStatusEvent);
          break;
        case "context_update":
          h.onContext?.(msg as unknown as { themes: string[]; confidence: number });
          break;
        case "audio_error":
          h.onError?.(msg as unknown as { error: string; detail?: string });
          break;
        default:
          break;
      }
    };

    const connect = () => {
      try {
        ws = new WebSocket(url);
      } catch {
        reconnectTimer = setTimeout(connect, 2000);
        return;
      }
      ws.onopen = () => handlersRef.current.onConnected?.(true);
      ws.onerror = () => ws?.close();
      ws.onclose = () => {
        handlersRef.current.onConnected?.(false);
        if (!closed) reconnectTimer = setTimeout(connect, 1500);
      };
      ws.onmessage = (ev: MessageEvent) => {
        if (typeof ev.data !== "string") return; // binary PCM — not for the UI
        let msg: RawMessage;
        try {
          msg = JSON.parse(ev.data) as RawMessage;
        } catch {
          return;
        }
        dispatch(msg);
      };
    };

    connect();
    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [url]);
}

/** Fire-and-forget POST to a sidecar REST endpoint (session/action wiring). */
export async function sidecarPost(path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${SIDECAR_HTTP}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return res.ok ? res.json() : Promise.reject(new Error(`${res.status}`));
}
