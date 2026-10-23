import type { VideoAsset } from "../../../lib/videoImport";
import { DEFAULT_AUDIO_SETTINGS, DEFAULT_IMAGE_SETTINGS, DEFAULT_VIDEO_SETTINGS, type MediaItem } from "../../../types/media";

export const MEDIA_STORAGE_KEY = "sermonsync-media-library-v1";

export const MEDIA_CATALOG_EVENT = "sermonsync-media-catalog-changed";

export const MEDIA_IMPORT_EVENT = "sermonsync-media-import-changed";

export type PendingVideo = { path: string; name: string; state: string; percent: number | null; error?: string; assetId?: string; recoveryInFlight?: boolean; startedAt: number; controller: AbortController };

export const pendingVideos = new Map<string, PendingVideo>();

export const migratingVideos = new Set<string>();
export const migratingAudio = new Set<string>();
export const failedAudioMigrations = new Set<string>();

export function notifyMediaCatalog(): void {
  window.dispatchEvent(new Event(MEDIA_CATALOG_EVENT));
}

export function notifyMediaImports(): void {
  window.dispatchEvent(new Event(MEDIA_IMPORT_EVENT));
}

export function mutateSavedMediaItems(update: (items: MediaItem[]) => MediaItem[]): void {
  saveMediaItems(update(loadMediaItems()));
  notifyMediaCatalog();
}

export function finishMediaVideoImport(path: string, controller: AbortController, asset: VideoAsset): void {
  const entry = pendingVideos.get(path);
  if (!entry || entry.controller !== controller || controller.signal.aborted) return;
  mutateSavedMediaItems((current) => current.some((item) => item.category === "videos" && item.path === asset.path)
    ? current
    : [...current, withDefaultSettings({ id: `videos-${asset.id}`, name: entry.name, path: asset.path, category: "videos" })]);
  pendingVideos.delete(path);
  notifyMediaImports();
}

export function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function loadMediaItems(): MediaItem[] {
  try {
    const raw = window.localStorage.getItem(MEDIA_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MediaItem[]) : [];
  } catch {
    return [];
  }
}

export function saveMediaItems(items: MediaItem[]): void {
  try {
    window.localStorage.setItem(MEDIA_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage unavailable (e.g. private browsing) — gallery just won't persist.
  }
}

export interface MediaContextMenuState {
  item: MediaItem;
  x: number;
  y: number;
}

export function withDefaultSettings(item: MediaItem): MediaItem {
  if (item.category === "images" && !item.imageSettings) {
    return { ...item, imageSettings: { ...DEFAULT_IMAGE_SETTINGS, filters: { ...DEFAULT_IMAGE_SETTINGS.filters } } };
  }
  if (item.category === "videos" && !item.videoSettings) {
    return { ...item, videoSettings: { ...DEFAULT_VIDEO_SETTINGS, filters: { ...DEFAULT_VIDEO_SETTINGS.filters } } };
  }
  if (item.category === "audio" && !item.audioSettings) {
    return { ...item, audioSettings: { ...DEFAULT_AUDIO_SETTINGS } };
  }
  return item;
}
