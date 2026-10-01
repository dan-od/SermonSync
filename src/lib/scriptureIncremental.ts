// ---------------------------------------------------------------------------
// Incremental reference typing ("2" -> every book starting with "2", then
// "2 chr" -> uniquely "2 Chronicles" auto-selected, then "2 chr 5" -> chapter
// 5 awaiting a verse, then "2 chr 5 3" -> the full reference) — FreeShow-style
// space-delimited reference entry, as opposed to the strict "Book ch:v" parse
// in scriptureSearch.ts.
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
