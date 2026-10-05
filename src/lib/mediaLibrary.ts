import type { MediaCategory } from "../types/media";

export const MEDIA_CATEGORIES: { id: MediaCategory; label: string; extensions: string[] }[] = [
  { id: "audio", label: "Audio", extensions: ["mp3", "wav", "ogg", "oga", "flac", "m4a", "aac", "aif", "aiff", "opus", "wma"] },
  { id: "images", label: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "tif", "tiff", "avif"] },
  { id: "videos", label: "Videos", extensions: ["mp4", "mov", "webm", "mkv", "avi", "m4v", "mpg", "mpeg", "wmv", "flv", "ogv", "ts", "mts", "m2ts", "3gp"] },
];

export const MEDIA_FILE_EXTENSIONS = MEDIA_CATEGORIES.flatMap((category) => category.extensions);

export function mediaCategoryForPath(path: string): MediaCategory | null {
  const filename = path.split(/[\\/]/).pop() ?? "";
  const extension = filename.includes(".") ? filename.slice(filename.lastIndexOf(".") + 1).toLowerCase() : "";
  return MEDIA_CATEGORIES.find((category) => category.extensions.includes(extension))?.id ?? null;
}
