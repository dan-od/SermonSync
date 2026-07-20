import type { ProjectorSlide } from "../../types/state";

export interface TranscriptItem {
  id: string;
  timestamp: string;
  speaker: string;
  text: string;
  matches: string[];
}

export interface BiblePassage extends ProjectorSlide {
  searchText: string;
  themes: string[];
}

export interface DbTable {
  name: string;
  description: string;
  columns: string[];
  rows: Array<Record<string, string | number | boolean | null>>;
}
