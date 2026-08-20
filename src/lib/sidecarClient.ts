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
