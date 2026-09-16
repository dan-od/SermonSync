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

export interface SidecarLogEntry {
  time: string;
  level: string;
  logger: string;
  message: string;
}

export interface SidecarLogsResponse {
  logs: SidecarLogEntry[];
  ready: boolean;
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

export interface SidecarSessionResponse {
  id: string;
  status: string;
  unit_id?: string | null;
  unit_name?: string | null;
  started_at?: string;
  ended_at?: string | null;
}

export interface SessionSummaryResponse {
  session_id: string;
  title: string;
  draft: string;
  generated: string;
  updated_at: number;
}

export interface SessionHistoryItem {
  id: string;
  unit_id?: string | null;
  unit_name?: string | null;
  status: string;
  started_at: number;
  ended_at?: number | null;
  elapsed_seconds: number;
  event_count: number;
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

export function getSidecarLogs() {
  return fetchJson<SidecarLogsResponse>("/api/logs");
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

export function startSidecarSession(unitId: string, unitName?: string | null) {
  return fetchJson<SidecarSessionResponse>("/api/session/start", {
    method: "POST",
    body: JSON.stringify({ unit_id: unitId, unit_name: unitName ?? undefined }),
  });
}

export function endSidecarSession() {
  return fetchJson<SidecarSessionResponse>("/api/session/end", {
    method: "POST",
  });
}

export function getSessionSummary(sessionId: string) {
  return fetchJson<{ summary: SessionSummaryResponse | null }>(`/api/archive/sessions/${encodeURIComponent(sessionId)}/summary`);
}

export function saveSessionSummary(sessionId: string, summary: Pick<SessionSummaryResponse, "title" | "draft" | "generated">) {
  return fetchJson<{ summary: SessionSummaryResponse }>(`/api/archive/sessions/${encodeURIComponent(sessionId)}/summary`, {
    method: "PUT",
    body: JSON.stringify(summary),
  });
}

export function getSessionHistory(limit = 50) {
  return fetchJson<{ count: number; sessions: SessionHistoryItem[] }>(`/api/archive/sessions?limit=${limit}`);
}

export function setActiveBibleVersion(version: string) {
  return fetchJson<{ version: string }>("/api/bible/active-version", {
    method: "PUT",
    body: JSON.stringify({ version }),
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
