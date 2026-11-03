// ---------------------------------------------------------------------------
// Scripture suggestions
// ---------------------------------------------------------------------------

export interface ScriptureReference {
  book: string;
  chapter: number;
  verse: number;
}

/** Which pipeline stage produced a suggestion (1=Trie … 4=Neural). */
/** 0 = explicitly spoken reference ("John 3:16"); 1–4 = matcher stages. */
export type PipelineStage = 0 | 1 | 2 | 3 | 4;

export type SuggestionStatus = "pending" | "sent" | "dismissed" | "edited";

export interface SuggestionCard {
  id: string;
  reference: ScriptureReference;
  text: string;
  /** 0.0 - 1.0 */
  confidence: number;
  pipelineStage: PipelineStage;
  status: SuggestionStatus;
  /** e.g. "ENGLISHNKJ" */
  version: string;
  /** theme/context labels, e.g. ["DIVINE SALVATION", "ETERNAL HOPE"] */
  themes: string[];
  /** epoch ms at ingest/creation time; used for chronological deck ordering */
  createdAt?: number;
  pinned?: boolean;
}
