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

const passageLibrary = [
  {
    reference: { book: "John", chapter: 1, verse: 1 },
    text: "In the beginning was the Word, and the Word was with God, and the Word was God.",
    version: "KJV",
    searchText: "beginning word god creation logos",
  },
  {
    reference: { book: "John", chapter: 3, verse: 16 },
    text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
    version: "KJV",
    searchText: "love salvation eternal life gospel invitation",
  },
  {
    reference: { book: "Acts", chapter: 1, verse: 8 },
    text: "But ye shall receive power, after that the Holy Ghost is come upon you: and ye shall be witnesses unto me.",
    version: "KJV",
    searchText: "power witness holy spirit mission fire",
  },
  {
    reference: { book: "Isaiah", chapter: 53, verse: 5 },
    text: "But he was wounded for our transgressions, he was bruised for our iniquities: with his stripes we are healed.",
    version: "KJV",
    searchText: "healing stripes restoration covenant",
  },
  {
    reference: { book: "Romans", chapter: 10, verse: 9 },
    text: "That if thou shalt confess with thy mouth the Lord Jesus, and shalt believe in thine heart that God hath raised him from the dead, thou shalt be saved.",
    version: "KJV",
    searchText: "confession salvation faith response altar call",
  },
  {
    reference: { book: "Psalm", chapter: 121, verse: 1 },
    text: "I will lift up mine eyes unto the hills, from whence cometh my help.",
    version: "KJV",
    searchText: "help confidence assurance worship",
  },
  {
    reference: { book: "Philippians", chapter: 4, verse: 6 },
    text: "Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God.",
    version: "KJV",
    searchText: "prayer thanksgiving anxiety peace petition",
  },
] as const;

export const knownScriptureBooks = [
  "Genesis",
  "Exodus",
  "Leviticus",
  "Numbers",
  "Deuteronomy",
  "Joshua",
  "Judges",
  "Ruth",
  "1 Samuel",
  "2 Samuel",
  "1 Kings",
  "2 Kings",
  "1 Chronicles",
  "2 Chronicles",
  "Ezra",
  "Nehemiah",
  "Esther",
  "Job",
  "Psalms",
  "Proverbs",
  "Ecclesiastes",
  "Song of Solomon",
  "Isaiah",
  "Jeremiah",
  "Lamentations",
  "Ezekiel",
  "Daniel",
  "Hosea",
  "Joel",
  "Amos",
  "Obadiah",
  "Jonah",
  "Micah",
  "Nahum",
  "Habakkuk",
  "Zephaniah",
  "Haggai",
  "Zechariah",
  "Malachi",
  "Matthew",
  "Mark",
  "Luke",
  "John",
  "Acts",
  "Romans",
  "1 Corinthians",
  "2 Corinthians",
  "Galatians",
  "Ephesians",
  "Philippians",
  "Colossians",
  "1 Thessalonians",
  "2 Thessalonians",
  "1 Timothy",
  "2 Timothy",
  "Titus",
  "Philemon",
  "Hebrews",
  "James",
  "1 Peter",
  "2 Peter",
  "1 John",
  "2 John",
  "3 John",
  "Jude",
  "Revelation",
];

type Passage = (typeof passageLibrary)[number];

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

// ---------------------------------------------------------------------------
// Incremental reference typing ("2" -> every book starting with "2", then
// "2 chr" -> uniquely "2 Chronicles" auto-selected, then "2 chr 5" -> chapter
// 5 awaiting a verse, then "2 chr 5 3" -> the full reference) — FreeShow-style
// space-delimited reference entry, as opposed to the strict "Book ch:v" parse
// above.
// ---------------------------------------------------------------------------

export interface IncrementalReferenceMatch {
  /** Book names (in the order given) still compatible with the typed prefix. */
  candidateBooks: string[];
  /** Set once the typed book segment uniquely identifies a single book. */
  matchedBook: string | null;
  chapter: number | null;
  verse: number | null;
}

function bookNameTokens(book: string) {
  return book.toLowerCase().split(/\s+/).filter(Boolean);
}

function isTokenPrefixMatch(queryTokens: string[], bookTokens: string[]) {
  return queryTokens.every((token, index) => bookTokens[index]?.startsWith(token) ?? false);
}

/**
 * Resolves a space-delimited reference query incrementally against a list of
 * book names, book by book, so the Book pane can narrow live as the user
 * types instead of requiring a fully-formed "Book ch:v" string up front.
 */
export function matchScriptureReferenceIncremental(query: string, bookNames: string[]): IncrementalReferenceMatch {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return { candidateBooks: bookNames, matchedBook: null, chapter: null, verse: null };
  }

  const fullNameMatches = bookNames.filter((book) => {
    const bookTokens = bookNameTokens(book);
    if (tokens.length < bookTokens.length) {
      return false;
    }
    return isTokenPrefixMatch(
      tokens.slice(0, bookTokens.length).map((token) => token.toLowerCase()),
      bookTokens,
    );
  });
  const distinctFullMatches = Array.from(new Set(fullNameMatches));

  if (distinctFullMatches.length === 1) {
    const matchedBook = distinctFullMatches[0];
    const remainder = tokens.slice(bookNameTokens(matchedBook).length);
    const chapter = remainder[0] ? Number.parseInt(remainder[0], 10) : NaN;
    const verse = remainder[1] ? Number.parseInt(remainder[1], 10) : NaN;
    return {
      candidateBooks: [matchedBook],
      matchedBook,
      chapter: Number.isFinite(chapter) ? chapter : null,
      verse: Number.isFinite(verse) ? verse : null,
    };
  }

  // Still ambiguous (or only partially typed) — surface every book whose name
  // is prefix-compatible with the tokens typed so far.
  const candidateBooks = bookNames.filter((book) => {
    const bookTokens = bookNameTokens(book);
    const consumeLen = Math.min(bookTokens.length, tokens.length);
    return isTokenPrefixMatch(
      tokens.slice(0, consumeLen).map((token) => token.toLowerCase()),
      bookTokens,
    );
  });

  return { candidateBooks, matchedBook: null, chapter: null, verse: null };
}
