/**
 * Scripture search.
 *
 * Two independent strategies, tried in order:
 *  1. Explicit reference parsing ("John 3:16", "1 Corinthians 13:4-7") via a
 *     greedy book-name prefix matcher (handles multi-word book names like
 *     "1 Corinthians" or "Song of Solomon" correctly, unlike a single-token
 *     match).
 *  2. Fuzzy free-text lookup over the local passage library via an inverted
 *     word index plus weighted phrase scoring, so paraphrases and partial
 *     quotes still resolve to the closest verse.
 */

import { knownScriptureBooks, passageLibrary } from "./scriptureData";
import type { Passage } from "./scriptureData";

export { knownScriptureBooks } from "./scriptureData";
export { matchScriptureReferenceIncremental } from "./scriptureIncremental";
export type { IncrementalReferenceMatch } from "./scriptureIncremental";

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  const normalized = normalizeSearchText(value);
  return normalized ? normalized.split(" ") : [];
}

function makeReference(book: string, chapter: number, verse: number) {
  return { reference: { book, chapter, verse }, value: `${book} ${chapter}:${verse}` };
}

// ---------------------------------------------------------------------------
// Explicit reference parsing ("John 3:16", "1 Corinthians 13:4-7")
// ---------------------------------------------------------------------------

/**
 * Finds the book whose name best matches a leading run of the query tokens,
 * trying every book at its own token length so multi-word names ("1
 * Corinthians", "Song of Solomon") are matched as a whole instead of just
 * comparing the first word.
 */
function matchBookPrefix(rawTokens: string[]): { book: string; tokensConsumed: number } | null {
  let best: { book: string; tokensConsumed: number; score: number } | null = null;

  for (const book of knownScriptureBooks) {
    const bookTokens = normalizeSearchText(book).split(" ").filter(Boolean);
    if (bookTokens.length === 0 || bookTokens.length > rawTokens.length) {
      continue;
    }

    const candidate = rawTokens
      .slice(0, bookTokens.length)
      .map(normalizeSearchText)
      .join(" ");
    const bookNormalized = bookTokens.join(" ");

    let score: number;
    if (candidate === bookNormalized) {
      score = 100 + bookTokens.length;
    } else if (candidate.length >= 2 && bookNormalized.startsWith(candidate)) {
      score = 50 + candidate.length;
    } else {
      continue;
    }

    if (!best || score > best.score) {
      best = { book, tokensConsumed: bookTokens.length, score };
    }
  }

  return best ? { book: best.book, tokensConsumed: best.tokensConsumed } : null;
}

function parseExplicitReference(rawQuery: string): { book: string; chapter: number; verse: number } | null {
  const rawTokens = rawQuery.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (rawTokens.length < 2) {
    return null;
  }

  const bookMatch = matchBookPrefix(rawTokens);
  if (!bookMatch) {
    return null;
  }

  // Only the first ";"-separated segment resolves to a reference; verse
  // ranges collapse to their opening verse (e.g. "13:4-7" -> verse 4).
  const remainder = rawTokens.slice(bookMatch.tokensConsumed).join(" ").split(";")[0]?.trim() ?? "";
  const locationMatch = remainder.match(/^(\d+)\s*[:.\s]\s*(\d+)/);
  if (!locationMatch) {
    return null;
  }

  const chapter = Number.parseInt(locationMatch[1], 10);
  const verse = Number.parseInt(locationMatch[2], 10);
  if (!Number.isFinite(chapter) || !Number.isFinite(verse) || chapter <= 0 || verse <= 0) {
    return null;
  }

  return { book: bookMatch.book, chapter, verse };
}

// ---------------------------------------------------------------------------
// Fuzzy free-text search (inverted word index + weighted phrase scoring)
// ---------------------------------------------------------------------------

function passageSearchableText(passage: Passage) {
  return [passage.reference.book, passage.text, passage.searchText].join(" ");
}

let wordIndex: Map<string, number[]> | null = null;

function getWordIndex() {
  if (wordIndex) {
    return wordIndex;
  }

  const index = new Map<string, number[]>();
  passageLibrary.forEach((passage, passageIndex) => {
    const uniqueWords = new Set(tokenize(passageSearchableText(passage)));
    uniqueWords.forEach((word) => {
      const bucket = index.get(word);
      if (bucket) {
        bucket.push(passageIndex);
      } else {
        index.set(word, [passageIndex]);
      }
    });
  });

  wordIndex = index;
  return index;
}

/**
 * Full phrase, then shrinking sliding-window subphrases, then individual
 * words — each tier weighted lower than the last so an exact phrase match
 * always outranks scattered single-word hits.
 */
function weightedQueryTerms(queryTokens: string[]) {
  const terms: { term: string; weight: number }[] = [];
  const total = queryTokens.length;

  if (total >= 2) {
    terms.push({ term: queryTokens.join(" "), weight: 6 });
  }

  for (let windowSize = Math.min(total - 1, 5); windowSize >= 2; windowSize -= 1) {
    for (let start = 0; start + windowSize <= total; start += 1) {
      terms.push({ term: queryTokens.slice(start, start + windowSize).join(" "), weight: 2 + windowSize * 0.3 });
    }
  }

  queryTokens.forEach((token) => {
    if (token.length >= 3) {
      terms.push({ term: token, weight: 1 });
    }
  });

  return terms;
}

function rankPassages(query: string, limit: number) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return [] as { passage: Passage; score: number }[];
  }

  const index = getWordIndex();
  const wordMatchCounts = new Map<number, number>();
  queryTokens.forEach((token) => {
    if (token.length < 2) {
      return;
    }
    (index.get(token) ?? []).forEach((passageIndex) => {
      wordMatchCounts.set(passageIndex, (wordMatchCounts.get(passageIndex) ?? 0) + 1);
    });
  });

  const minMatches = Math.min(queryTokens.length, 2);
  const terms = weightedQueryTerms(queryTokens);

  const scored = Array.from(wordMatchCounts.entries())
    .filter(([, matches]) => matches >= minMatches)
    .map(([passageIndex, matches]) => {
      const passage = passageLibrary[passageIndex];
      const haystack = normalizeSearchText(passageSearchableText(passage));
      const phraseBonus = terms.reduce((total, { term, weight }) => (haystack.includes(term) ? total + weight : total), 0);
      return { passage, score: matches + phraseBonus };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}

/** Ranked fuzzy matches for the local passage library, most relevant first. */
export function searchScripturePassages(query: string, limit = 8) {
  const rawQuery = query.trim();
  if (!rawQuery) {
    return [];
  }
  return rankPassages(rawQuery, limit).map(({ passage, score }) => ({ ...passage, score }));
}

export function resolveScriptureSearch(query: string) {
  const rawQuery = query.trim();
  if (!rawQuery) {
    return null;
  }

  const explicit = parseExplicitReference(rawQuery);
  if (explicit) {
    return makeReference(explicit.book, explicit.chapter, explicit.verse);
  }

  const [best] = rankPassages(rawQuery, 1);
  if (best) {
    return makeReference(best.passage.reference.book, best.passage.reference.chapter, best.passage.reference.verse);
  }

  return null;
}

/**
 * Reference-only resolution, no fuzzy word fallback — for the "Reference"
 * search mode toggle, where a non-matching query should surface no results
 * rather than silently falling back to a word search.
 */
export function resolveScriptureReference(query: string) {
  const rawQuery = query.trim();
  if (!rawQuery) {
    return null;
  }

  const explicit = parseExplicitReference(rawQuery);
  return explicit ? makeReference(explicit.book, explicit.chapter, explicit.verse) : null;
}
