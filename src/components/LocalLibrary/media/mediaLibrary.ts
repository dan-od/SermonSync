// ─── Media tab ────────────────────────────────────────────────────────────────

export type MediaCategory = "audio" | "images" | "videos";

export interface MediaItem {
  id: string;
  name: string;
  path: string;
  category: MediaCategory;
}

export const MEDIA_STORAGE_KEY = "sermonsync-media-library-v1";

export const MEDIA_CATEGORIES: { id: MediaCategory; label: string; extensions: string[] }[] = [
  { id: "audio", label: "Audio", extensions: ["mp3", "wav", "ogg", "flac", "m4a", "aac"] },
  { id: "images", label: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"] },
  { id: "videos", label: "Videos", extensions: ["mp4", "mov", "webm", "mkv", "avi"] },
];

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
