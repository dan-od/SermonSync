/** Pure helpers for parsing tagged song text into slides (Song Studio). */
import type { SongSlide } from "../../stores/songStore";

export interface SongTextBlock {
  label: string;
  text: string;
  tag: string | null;
  explicitTag: string | null;
}

export const SONG_TAG_PATTERN = /^\[([^\]]+)\]\s*$/;

export function subTagSuffix(index: number): string {
  let value = index;
  let suffix = "";
  do {
    suffix = String.fromCharCode(97 + (value % 26)) + suffix;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return suffix;
}

export function parseSongText(value: string): SongTextBlock[] {
  let currentTag: string | null = null;
  return value
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.trim().split("\n");
      const tagMatch = lines[0]?.match(SONG_TAG_PATTERN);
      const explicitTag = tagMatch?.[1].trim() || null;
      if (explicitTag) currentTag = explicitTag;
      const text = (tagMatch ? lines.slice(1) : lines).join("\n").trim();
      return {
        label: currentTag ?? "Unlabeled",
        text,
        tag: currentTag,
        explicitTag,
      };
    })
    .filter((block) => block.tag || block.text);
}

export function songTextFromSlides(slides: SongSlide[]): string {
  return slides.map((slide) => `[${slide.label}]\n${slide.text}`).join("\n\n");
}

export function songSlidesEqual(first: SongSlide[], second: SongSlide[]): boolean {
  return first.length === second.length && first.every((slide, index) => {
    const other = second[index];
    return other?.label === slide.label && other.text === slide.text;
  });
}
