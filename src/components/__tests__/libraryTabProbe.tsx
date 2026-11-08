import { useEffect, useState } from "react";
import type { LibraryTab, SearchableLibraryTabProps } from "../Library/types";

export function makeLibraryTabProbe(tab: LibraryTab) {
  return function LibraryTabProbe({ isActive, searchQuery, onNavigationHandlerChange }: Partial<SearchableLibraryTabProps>) {
    const [draft, setDraft] = useState("");
    const [filter, setFilter] = useState("all");
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
      if ((tab !== "scriptures" && tab !== "songs") || isActive === false) return;
      onNavigationHandlerChange?.((direction) => {
        window.dispatchEvent(new CustomEvent("library-tab-navigation-test", { detail: { tab, direction } }));
      });
      return () => onNavigationHandlerChange?.(null);
    }, [isActive, onNavigationHandlerChange]);

    return (
      <section aria-label={`${tab} probe`}>
        <input aria-label={`${tab} draft`} value={draft} onChange={(event) => setDraft(event.target.value)} />
        <select aria-label={`${tab} filter`} value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">All</option>
          <option value="custom">Custom</option>
        </select>
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{tab} section</button>
        <div data-testid={`${tab}-scroll`} style={{ height: 40, overflow: "auto" }}><div style={{ height: 400 }} /></div>
        <output aria-label={`${tab} query`}>{searchQuery ?? ""}</output>
      </section>
    );
  };
}
