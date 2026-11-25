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
  return [
    `brightness(${f.brightness}%)`,
    `contrast(${f.contrast}%)`,
    `saturate(${f.saturate}%)`,
    `grayscale(${f.grayscale}%)`,
    `sepia(${f.sepia}%)`,
    `invert(${f.invert}%)`,
    `hue-rotate(${f.hueRotate}deg)`,
    `blur(${f.blur}px)`,
  ].join(" ");
}

export function flipTransform(flipX?: boolean, flipY?: boolean): string {
  if (!flipX && !flipY) return "none";
  return `scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})`;
}
