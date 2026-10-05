import { DEFAULT_MEDIA_FILTERS, type MediaFilters } from "../lib/mediaFilters";

export type MediaCategory = "audio" | "images" | "videos";

export type MediaFit = "cover" | "contain" | "fill";

export interface ImageMediaSettings {
  fit: MediaFit;
  flipX: boolean;
  flipY: boolean;
  opacity: number;
  filters: MediaFilters;
}

export interface VideoMediaSettings extends ImageMediaSettings {
  loop: boolean;
  muted: boolean;
  volume: number;
  speed: number;
  trimStart: number;
  trimEnd: number | null;
}

export interface AudioMediaSettings {
  volume: number;
  trimStart: number;
  trimEnd: number | null;
}

export interface MediaItem {
  id: string;
  name: string;
  path: string;
  category: MediaCategory;
  imageSettings?: ImageMediaSettings;
  videoSettings?: VideoMediaSettings;
  audioSettings?: AudioMediaSettings;
}

export const DEFAULT_IMAGE_SETTINGS: ImageMediaSettings = {
  fit: "cover",
  flipX: false,
  flipY: false,
  opacity: 1,
  filters: { ...DEFAULT_MEDIA_FILTERS },
};

export const DEFAULT_VIDEO_SETTINGS: VideoMediaSettings = {
  ...DEFAULT_IMAGE_SETTINGS,
  filters: { ...DEFAULT_MEDIA_FILTERS },
  loop: false,
  muted: true,
  volume: 1,
  speed: 1,
  trimStart: 0,
  trimEnd: null,
};

export const DEFAULT_AUDIO_SETTINGS: AudioMediaSettings = {
  volume: 1,
  trimStart: 0,
  trimEnd: null,
};
