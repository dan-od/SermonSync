// ---------------------------------------------------------------------------
// System configuration
// ---------------------------------------------------------------------------

export type UiTheme = "dark" | "light";

export interface BibleVersionSummary {
  abbreviation: string;
  name: string;
  verse_count: number;
  available: boolean;
}

export type ModelProviderId = "groq" | "openai" | "anthropic" | "gemini";

export interface SystemConfig {
  unitId: string;
  unitName: string;
  bibleVersion: string;
  bibleVersions: BibleVersionSummary[];
  theme: UiTheme;
  groqApiKey: string | null;
  groqEnabled: boolean;
  /** API keys for non-Groq providers; Groq keeps its own dedicated fields above. */
  modelProviderKeys: Partial<Record<Exclude<ModelProviderId, "groq">, string>>;
  defaultModelProvider: ModelProviderId | null;
}
