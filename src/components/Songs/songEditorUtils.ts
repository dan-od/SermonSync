import { type SongSlide } from "../../stores/songStore";
import { type SongTextBlock, SONG_TAG_PATTERN, subTagSuffix, parseSongText } from "./songText";

export function buildProjectionCueSlides(songText: string, cueOrder: string, songTitle: string): SongSlide[] {
  const sourceBlocks = parseSongText(songText);
  const rangesByTag = new Map<string, SongTextBlock[][]>();
  let currentRange: SongTextBlock[] | null = null;
  sourceBlocks.forEach((block) => {
    if (!block.tag) return;
    if (block.explicitTag || !currentRange || currentRange[0]?.tag !== block.tag) {
      currentRange = [];
      const ranges = rangesByTag.get(block.tag) ?? [];
      ranges.push(currentRange);
      rangesByTag.set(block.tag, ranges);
    }
    currentRange.push(block);
  });

  const uniqueRangesByTag = new Map<string, SongTextBlock[][]>();
  rangesByTag.forEach((ranges, tag) => {
    const seenRanges = new Set<string>();
    const uniqueRanges = ranges.filter((range) => {
      const identity = range.map((block) => block.text.trim()).join("\u001f");
      if (seenRanges.has(identity)) return false;
      seenRanges.add(identity);
      return true;
    });
    uniqueRangesByTag.set(tag, uniqueRanges);
  });

  return cueOrder
      .split("\n")
      .flatMap((line) => {
        const cueItem = line.trim();
        if (!cueItem) return [];
        if (cueItem === "{song_title}") return [{ label: "Song Title", text: songTitle }];

        const tag = cueItem.match(SONG_TAG_PATTERN)?.[1].trim() ?? cueItem;
        const ranges = uniqueRangesByTag.get(tag);
        if (!ranges || ranges.length === 0) return [];
        return ranges.flatMap((range) => range.flatMap((block, index) => {
          if (!block.text.trim()) return [];
          return [{
            label: block.explicitTag ? tag : `${tag} ${subTagSuffix(index)}`,
            text: block.text,
          }];
        }));
    });
}
