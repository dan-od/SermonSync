import type { LibraryTab } from "../components/Library/types";

export type LibrarySearchQueries = Record<LibraryTab, string>;

export function updateLibrarySearchQuery(
  queries: LibrarySearchQueries,
  tab: LibraryTab,
  nextValue: string | ((previousValue: string) => string),
): LibrarySearchQueries {
  const previousValue = queries[tab];
  const value = typeof nextValue === "function" ? nextValue(previousValue) : nextValue;
  return value === previousValue ? queries : { ...queries, [tab]: value };
}
