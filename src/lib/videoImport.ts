import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface VideoAsset {
  id: string;
  path: string;
  posterPath: string;
  durationMs: number;
  sourceSha256: string;
  profile: "sermonsync-playback-v1";
}

export interface VideoImportProgress {
  requestId: string;
  state: "queued" | "precheck" | "probing" | "processing" | "validating" | "committing" | "ready";
  percent: number | null;
  assetId?: string;
}

export interface VideoImportError {
  code: string;
  message: string;
}

const managedAsset = /[\\/]media[\\/]videos[\\/]assets[\\/]([0-9a-f]{64}-sermonsync-playback-v1)[\\/]playback\.mp4$/i;

export function isManagedVideo(path: string): boolean {
  return managedAsset.test(path);
}

export function managedVideoUrl(path: string): string | null {
  const match = path.match(managedAsset);
  return match ? `http://127.0.0.1:8000/api/media-video/${match[1]}/playback.mp4` : null;
}

export function managedVideoPosterUrl(path: string): string | null {
  const match = path.match(managedAsset);
  return match ? `http://127.0.0.1:8000/api/media-video/${match[1]}/poster.jpg` : null;
}

export function importErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

export async function importVideo(
  path: string,
  options: { legacy?: boolean; maxSourceBytes?: number; onProgress?: (progress: VideoImportProgress) => void; signal?: AbortSignal } = {},
): Promise<VideoAsset> {
  const requestId = crypto.randomUUID();
  const unlisten = options.onProgress
    ? await listen<VideoImportProgress>("media-import://progress", ({ payload }) => {
      if (payload.requestId === requestId) options.onProgress?.(payload);
    })
    : () => undefined;
  const cancel = () => { void invoke("cancel_video_import", { requestId }); };
  options.signal?.addEventListener("abort", cancel, { once: true });
  try {
    if (options.signal?.aborted) {
      throw { code: "IMPORT_CANCELLED", message: "Video import was cancelled." } satisfies VideoImportError;
    }
    const request = invoke<VideoAsset>("import_video_asset", { path, requestId, legacy: options.legacy ?? false, maxSourceBytes: options.maxSourceBytes });
    if (options.signal?.aborted) cancel();
    return await request;
  } finally {
    options.signal?.removeEventListener("abort", cancel);
    unlisten();
  }
}
