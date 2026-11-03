import bibleBooks from "../../python-sidecar/data/bible_books.json";

export const passageLibrary = [
  {
    reference: { book: "John", chapter: 1, verse: 1 },
    text: "In the beginning was the Word, and the Word was with God, and the Word was God.",
    version: "ENGLISHNKJ",
    searchText: "beginning word god creation logos",
  },
  {
    reference: { book: "John", chapter: 3, verse: 16 },
    text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
    version: "ENGLISHNKJ",
    searchText: "love salvation eternal life gospel invitation",
  },
  {
    reference: { book: "Acts", chapter: 1, verse: 8 },
    text: "But ye shall receive power, after that the Holy Ghost is come upon you: and ye shall be witnesses unto me.",
    version: "ENGLISHNKJ",
    searchText: "power witness holy spirit mission fire",
  },
  {
    reference: { book: "Isaiah", chapter: 53, verse: 5 },
    text: "But he was wounded for our transgressions, he was bruised for our iniquities: with his stripes we are healed.",
    version: "ENGLISHNKJ",
    searchText: "healing stripes restoration covenant",
  },
  {
    reference: { book: "Romans", chapter: 10, verse: 9 },
    text: "That if thou shalt confess with thy mouth the Lord Jesus, and shalt believe in thine heart that God hath raised him from the dead, thou shalt be saved.",
    version: "ENGLISHNKJ",
    searchText: "confession salvation faith response altar call",
  },
  {
    reference: { book: "Psalm", chapter: 121, verse: 1 },
    text: "I will lift up mine eyes unto the hills, from whence cometh my help.",
    version: "ENGLISHNKJ",
    searchText: "help confidence assurance worship",
  },
  {
    reference: { book: "Philippians", chapter: 4, verse: 6 },
    text: "Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God.",
    version: "ENGLISHNKJ",
    searchText: "prayer thanksgiving anxiety peace petition",
  },
] as const;

interface BookTableEntry {
  name: string;
  ordinal?: number;
  aliases: string[];
  homophones?: string[];
  weak?: boolean;
}

// Shared with the sidecar's spoken-reference parser (Stage 0), so typed
// search and live detection agree on book names and aliases.
const bookTable = bibleBooks as { ordinals: Record<string, string[]>; books: BookTableEntry[] };

export const knownScriptureBooks: string[] = bookTable.books.map((book) => book.name);

/**
 * Typed spellings per book: the canonical name plus its aliases, with ordinal
 * prefixes for numbered books ("1st John", "First Corinthians", "II Kings").
 * Homophones are ASR damage, not something an operator types, so they stay
 * sidecar-only.
 */
export const bookSpellings: Array<{ book: string; spellings: string[] }> = bookTable.books.map((book) => {
  const spellings = new Set([book.name]);
  for (const alias of book.aliases) {
    if (book.ordinal) {
      for (const ordinal of bookTable.ordinals[String(book.ordinal)] ?? []) {
        spellings.add(`${ordinal} ${alias}`);
      }
    } else {
      spellings.add(alias);
    }
  }
  return { book: book.name, spellings: [...spellings] };
});

export type Passage = (typeof passageLibrary)[number];
