import { useAudioStore, useSessionStore, useSuggestionStore, useTranscriptionStore } from "../stores";
import type { SidecarWsEvent } from "../types/state";

const SIDECAR_WS_BASE = import.meta.env.VITE_SIDECAR_WS_BASE ?? "ws://127.0.0.1:8000/ws/audio";
const MAX_RECONNECT_DELAY_MS = 8000;

function isSidecarEvent(payload: unknown): payload is SidecarWsEvent {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  return "type" in payload;
}

class SidecarWsBridge {
  private socket: WebSocket | null = null;

  private reconnectTimer: number | null = null;

  private reconnectDelay = 600;

  private manualClose = false;

  connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.manualClose = false;
    const ws = new WebSocket(SIDECAR_WS_BASE);
    this.socket = ws;

    ws.addEventListener("open", () => {
      this.reconnectDelay = 600;
      useSessionStore.getState().setWsConnected(true);
      useAudioStore.getState().setStatus("connected");
    });

    ws.addEventListener("message", (event) => {
      if (typeof event.data !== "string") {
        return;
      }

      try {
        const parsed = JSON.parse(event.data) as unknown;
        if (!isSidecarEvent(parsed)) {
          return;
        }
        this.handleEvent(parsed);
      } catch {
        // Ignore malformed payloads to keep the stream alive.
      }
    });

    ws.addEventListener("close", () => {
      useSessionStore.getState().setWsConnected(false);
      useAudioStore.getState().setStatus("disconnected");
      this.socket = null;

      if (!this.manualClose) {
        this.scheduleReconnect();
      }
    });

    ws.addEventListener("error", () => {
      useAudioStore.getState().setAudioError("WebSocket connection error.");
    });
  }

  disconnect() {
    this.manualClose = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    useSessionStore.getState().setWsConnected(false);
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null || this.manualClose) {
      return;
    }

    const delay = this.reconnectDelay;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
  }

  private handleEvent(event: SidecarWsEvent) {
    dispatchSidecarEvent(event);
  }
}

export function dispatchSidecarEvent(event: SidecarWsEvent) {
  const audio = useAudioStore.getState();
  const transcription = useTranscriptionStore.getState();
  const session = useSessionStore.getState();

  switch (event.type) {
    case "ack": {
      session.setWsConnected(true);
      break;
    }
    case "audio_level": {
      audio.setAudioLevel(event.rms, event.peak);
      break;
    }
    case "vad_state": {
      audio.setVadState(event.is_speech, event.confidence);
      break;
    }
    case "state_change": {
      audio.setAcousticState(event.state, event.confidence);
      break;
    }
    case "audio_error": {
      audio.setAudioError(event.detail || event.error);
      break;
    }
    case "transcription": {
      if (typeof event.latency_ms === "number") {
        audio.setLatency(event.latency_ms);
      }
      transcription.ingestTranscription(event);
      break;
    }
    case "sentence": {
      transcription.ingestSentence(event);
      break;
    }
    case "suggestions": {
      useSuggestionStore.getState().ingestSuggestions(event, transcription.themes);
      break;
    }
    case "context_update": {
      transcription.setThemes(event);
      break;
    }
    case "system_status": {
      session.applySystemStatus(event);
      audio.setLatency(event.latency_ms);
      break;
    }
    default:
      break;
  }
}

const sidecarWsBridge = new SidecarWsBridge();

export function startSidecarWsBridge() {
  sidecarWsBridge.connect();
  return () => {
    sidecarWsBridge.disconnect();
  };
}
