import type { AudioInputDevice, SidecarSystemStatusEvent } from "../types/state";

const SIDECAR_HTTP_BASE = import.meta.env.VITE_SIDECAR_HTTP_BASE ?? "http://127.0.0.1:8000";

export interface AudioDevicesResponse {
  count: number;
  selected_index: number | null;
  devices: AudioInputDevice[];
}

export interface SelectDeviceRequest {
  index?: number;
  name?: string;
  channels?: number;
}

export interface StartCaptureResponse {
  capturing: boolean;
  device_index: number | null;
  sample_rate: number;
  channels: number;
}

export interface SelectDeviceResponse {
  selected: AudioInputDevice;
}

export interface StopCaptureResponse {
  capturing: boolean;
}

export interface VadSensitivityResponse {
  sensitivity: number;
  threshold: number;
}

export interface SidecarStatusResponse {
  engine: string;
  version: string;
  pipeline_stages: number;
}

export interface ScriptureLookupResponse {
  reference: string;
  book: string;
  chapter: number;
  verse: number;
  version: string;
  text: string;
  testament: string;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${SIDECAR_HTTP_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let detail = `Sidecar request failed (${response.status})`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string" && body.detail) {
        detail = body.detail;
      }
    } catch {
      // Keep generic error if body is not JSON.
    }
    throw new Error(detail);
  }

  return response.json() as Promise<T>;
}

export function getSidecarHttpBase() {
  return SIDECAR_HTTP_BASE;
}

export function getSidecarStatus() {
  return fetchJson<SidecarStatusResponse>("/api/status");
}

export function getSystemStatus() {
  return fetchJson<Omit<SidecarSystemStatusEvent, "type">>("/api/system/status");
}

export function getAudioDevices(refresh = false) {
  return fetchJson<AudioDevicesResponse>(`/api/audio/devices?refresh=${refresh ? "true" : "false"}`);
}

export function selectAudioDevice(req: SelectDeviceRequest) {
  return fetchJson<SelectDeviceResponse>("/api/audio/select-device", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function startAudioCapture() {
  return fetchJson<StartCaptureResponse>("/api/audio/start-capture", {
    method: "POST",
  });
}

export function stopAudioCapture() {
  return fetchJson<StopCaptureResponse>("/api/audio/stop-capture", {
    method: "POST",
  });
}

export function setVadSensitivity(sensitivity: number) {
  return fetchJson<VadSensitivityResponse>("/api/audio/vad-sensitivity", {
    method: "POST",
    body: JSON.stringify({ sensitivity }),
  });
}

/** Fetches a single verse's real text; resolves to `null` if the reference doesn't exist in that version. */
export async function lookupScriptureVerse(book: string, chapter: number, verse: number, version: string) {
  try {
    return await fetchJson<ScriptureLookupResponse>(
      `/api/bible/lookup?book=${encodeURIComponent(book)}&chapter=${chapter}&verse=${verse}&version=${encodeURIComponent(version)}`,
    );
  } catch {
    return null;
  }
}

/**
 * Groq cloud fallback (SS-050).
 *
 * `linked` is the sidecar's own verdict on whether Stage 3 can actually reach
 * Groq right now — it goes false when calls are failing, so the UI must not
 * infer "Connected" from the mere presence of a key.
 */
export interface GroqLastError {
  kind: string;
  message: string;
  retryable: boolean;
  status?: number;
  hint?: string;
}

export interface GroqStatusResponse {
  enabled: boolean;
  model: string;
  linked: boolean;
  active: boolean;
  key_problem: string | null;
  reason: string | null;
  healthy: boolean;
  last_error: GroqLastError | null;
  last_error_at: number | null;
  last_success_at: number | null;
  consecutive_failures: number;
  calls: number;
  failures: number;
  circuit_open: boolean;
  verification?: GroqTestResponse;
}

export interface GroqTestResponse {
  ok: boolean;
  model: string;
  sample?: string;
  error?: string;
  kind?: string;
  hint?: string;
  status?: number;
  retryable?: boolean;
}

export function getGroqStatus(verify = false) {
  return fetchJson<GroqStatusResponse>(`/api/groq/status${verify ? "?verify=true" : ""}`);
}

export function testGroqConnection(apiKey?: string | null, model?: string | null) {
  return fetchJson<GroqTestResponse>("/api/groq/test", {
    method: "POST",
    body: JSON.stringify({ api_key: apiKey ?? null, model: model ?? null }),
  });
}

export function saveGroqConfig(apiKey: string | null, enabled: boolean, model?: string | null) {
  return fetchJson<GroqStatusResponse>("/api/groq/config", {
    method: "POST",
    body: JSON.stringify({ api_key: apiKey, enabled, model: model ?? null }),
  });
}
