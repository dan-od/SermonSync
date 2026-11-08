import { type SongSlide } from "../../stores/songStore";

export type SongSearchProvider = "musixmatch" | "hymnary" | "brave";
export type SongContentType = "lyrics" | "instrumental" | "both" | "source";
export interface SongSearchResult {
  id: string;
  provider: SongSearchProvider;
  title: string;
  artist: string;
  sourceName: string;
  sourceUrl: string;
  contentType: SongContentType;
  text?: string;
  snippet?: string;
}

const headingAliases: Record<string, string> = {
  intro: "Intro", introduction: "Intro", verse: "Verse", stanza: "Verse",
  chorus: "Chorus", refrain: "Chorus", bridge: "Bridge", prechorus: "Pre-Chorus",
  "pre-chorus": "Pre-Chorus", "pre chorus": "Pre-Chorus", tag: "Tag", outro: "Outro",
  ending: "Outro", instrumental: "Instrumental", interlude: "Interlude", vamp: "Vamp",
};

export function normalizeSongHeadings(text: string): string {
  return text.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    const bracketedHeading = trimmed.match(/^\[([^\]]+)\]$/u);
    const colonHeading = trimmed.endsWith(":") && trimmed.length >= 2 && trimmed.length <= 41 && !trimmed.startsWith("[") && !trimmed.slice(0, -1).includes("]") && !trimmed.includes(".");
    const raw = bracketedHeading?.[1].trim() ?? (colonHeading ? trimmed.slice(0, -1).trim() : "");
    if (!raw) return line;
    const normalizedKey = raw.toLowerCase().replace(/\s+\d+$/u, "").replace(/\s+/gu, " ");
    const canonical = headingAliases[normalizedKey.replace(/\s/gu, "")] ?? headingAliases[normalizedKey] ?? raw;
    const numbered = raw.match(/\d+$/u)?.[0];
    return `[${canonical}${numbered && canonical === "Verse" ? ` ${numbered}` : ""}]`;
  }).join("\n").replace(/\n{3,}/gu, "\n\n").trim();
}

export function parseImportedSongText(text: string, contentType: SongContentType): SongSlide[] {
  const normalized = normalizeSongHeadings(text);
  if (!normalized && contentType === "instrumental") return [{ label: "Instrumental", text: "Instrumental" }];
  if (!normalized) return [];
  const withDefaultHeading = /^\[[^\]]+\]\s*$/mu.test(normalized)
    ? normalized
    : `[${contentType === "instrumental" ? "Instrumental" : "Verse 1"}]\n${normalized}`;
  const sections = withDefaultHeading.split(/\n\s*\n/u);
  const slides: SongSlide[] = [];
  let currentLabel = "Verse 1";
  for (const section of sections) {
    const lines = section.trim().split("\n");
    const heading = lines[0]?.match(/^\[([^\]]+)\]$/u);
    if (heading) currentLabel = heading[1].trim();
    const body = (heading ? lines.slice(1) : lines).join("\n").trim();
    if (body || heading) slides.push({ label: currentLabel, text: body || (currentLabel === "Instrumental" ? "Instrumental" : "") });
  }
  return slides.length ? slides : [{ label: "Verse 1", text: normalized }];
}

export function songSearchDeduplicationKey(result: SongSearchResult): string {
  return `${result.title} ${result.artist}`.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
