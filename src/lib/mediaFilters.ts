/** Shared image/video adjustment model used by the media studio editors and library thumbnails. */
export interface MediaFilters {
  brightness: number;
  contrast: number;
  saturate: number;
  grayscale: number;
  sepia: number;
  invert: number;
  hueRotate: number;
  blur: number;
}

export const DEFAULT_MEDIA_FILTERS: MediaFilters = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  grayscale: 0,
  sepia: 0,
  invert: 0,
  hueRotate: 0,
  blur: 0,
};

export function filtersToCss(filters: MediaFilters | undefined): string {
  const f = { ...DEFAULT_MEDIA_FILTERS, ...filters };
  const active = [
    f.brightness !== 100 ? `brightness(${f.brightness}%)` : "",
    f.contrast !== 100 ? `contrast(${f.contrast}%)` : "",
    f.saturate !== 100 ? `saturate(${f.saturate}%)` : "",
    f.grayscale !== 0 ? `grayscale(${f.grayscale}%)` : "",
    f.sepia !== 0 ? `sepia(${f.sepia}%)` : "",
    f.invert !== 0 ? `invert(${f.invert}%)` : "",
    f.hueRotate !== 0 ? `hue-rotate(${f.hueRotate}deg)` : "",
    f.blur !== 0 ? `blur(${f.blur}px)` : "",
  ].filter(Boolean);
  return active.length > 0 ? active.join(" ") : "none";
}

export function flipTransform(flipX?: boolean, flipY?: boolean): string {
  if (!flipX && !flipY) return "none";
  return `scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})`;
}
