import type { ProjectorSlide, TranscriptItem } from "../../types/state";

export type { TranscriptItem };

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
