import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { type SongSearchResult, songSearchDeduplicationKey } from "./songSearch";

type Filter = "all" | "hymns" | "songs";
interface ProviderStatus { done: boolean; message?: string }
interface SongSearchModalProps {
  open: boolean;
  query: string;
  artist: string;
  session: number;
  onSelect: (result: SongSearchResult) => void;
  onClose: () => void;
}

const providers = ["hymnary", "musixmatch", "brave"] as const;
const searchId = () => `song-search-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const recentResults = new Map<string, { at: number; results: SongSearchResult[] }>();

export function SongSearchModal({ open, query, artist, session, onSelect, onClose }: SongSearchModalProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [results, setResults] = useState<SongSearchResult[]>([]);
  const [status, setStatus] = useState<Record<string, ProviderStatus>>({});
  const [pasteResult, setPasteResult] = useState<SongSearchResult | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [activeSearchId, setActiveSearchId] = useState("");
  const resultsRef = useRef(results);
  resultsRef.current = results;
  useEffect(() => {
    if (!query.trim()) return;
    const id = searchId();
    setActiveSearchId(id);
    const cacheKey = `${query.trim().toLowerCase()}|${artist.trim().toLowerCase()}`;
    const cached = recentResults.get(cacheKey);
    setResults(cached && Date.now() - cached.at < 120_000 ? cached.results : []);
    setStatus({ hymnary: { done: false }, musixmatch: { done: false }, brave: { done: false } });
    let cancelled = false;
    const unlisteners: Array<() => void> = [];
    void Promise.all([
      listen<{ searchId: string; result: SongSearchResult }>("song-search-result", ({ payload }) => {
        if (payload.searchId !== id || cancelled) return;
        const key = songSearchDeduplicationKey(payload.result);
        const current = resultsRef.current;
        if (current.some((item) => songSearchDeduplicationKey(item) === key)) return;
        const next = [...current, payload.result];
        resultsRef.current = next;
        recentResults.set(cacheKey, { at: Date.now(), results: next });
        setResults(next);
      }).then((unlisten) => unlisteners.push(unlisten)),
      listen<{ searchId: string; provider: string; error?: string; skipped?: boolean }>("song-search-provider-done", ({ payload }) => {
        if (payload.searchId !== id || cancelled) return;
        setStatus((current) => ({ ...current, [payload.provider]: { done: true, message: payload.error || (payload.skipped ? "No API key configured" : undefined) } }));
      }).then((unlisten) => unlisteners.push(unlisten)),
    ]).then(() => invoke("start_song_search", { searchId: id, query, artist, filter: "all" })).catch((error: unknown) => {
      if (!cancelled) setStatus({ hymnary: { done: true, message: String(error) }, musixmatch: { done: true }, brave: { done: true } });
    });
    return () => {
      cancelled = true;
      unlisteners.forEach((unlisten) => unlisten());
      void invoke("cancel_song_search", { searchId: id }).catch(() => undefined);
    };
  }, [query, artist, session]);

  const filteredResults = useMemo(() => results.filter((result) => filter === "all" || (filter === "hymns" ? result.provider === "hymnary" : result.provider !== "hymnary")), [filter, results]);
  const searching = providers.some((provider) => !status[provider]?.done);
  const completedCount = providers.filter((provider) => status[provider]?.done).length;
  const startStudio = (result: SongSearchResult) => {
    if (result.contentType === "source") {
      setPasteResult(result);
      setPasteText("");
    } else onSelect(result);
  };

  return createPortal(
    <div style={{ display: open ? "flex" : "none", position: "fixed", inset: 0, zIndex: 1350, background: "var(--overlay-backdrop)", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <section role="dialog" aria-modal="true" aria-label="Search songs" style={{ width: "min(920px, 96vw)", maxHeight: "90vh", display: "flex", flexDirection: "column", background: "var(--bg-surface)", color: "var(--fg-base)", borderRadius: 12, boxShadow: "var(--shadow-lg)", overflow: "hidden" }}>
        <header style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-base)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><h2 style={{ margin: 0, fontSize: 20 }}>Search songs</h2><div style={{ color: "var(--fg-muted)", marginTop: 4 }}>“{query}”{artist ? ` by ${artist}` : ""}</div></div>
          <button type="button" onClick={() => { if (activeSearchId) void invoke("cancel_song_search", { searchId: activeSearchId }).catch(() => undefined); onClose(); }} aria-label="Cancel search" style={plainButton}>Cancel</button>
        </header>
        <nav aria-label="Result filters" style={{ display: "flex", gap: 8, padding: "14px 24px 8px" }}>{(["all", "hymns", "songs"] as const).map((item) => <button key={item} onClick={() => setFilter(item)} type="button" aria-pressed={filter === item} style={{ ...plainButton, background: filter === item ? "var(--color-primary)" : "var(--bg-elevated)", color: filter === item ? "var(--fg-on-accent)" : "var(--fg-base)" }}>{item[0]!.toUpperCase() + item.slice(1)}</button>)}</nav>
        <div style={{ overflow: "auto", minHeight: 240, margin: "0 24px", border: "1px solid var(--border-base)", borderRadius: 8 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}><thead style={{ position: "sticky", top: 0, background: "var(--bg-elevated)" }}><tr>{["Title", "Artist / Author", "Site / Collection", "Content", ""].map((label) => <th key={label} style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border-base)" }}>{label}</th>)}</tr></thead><tbody>{filteredResults.map((result) => <tr key={result.id}><td style={cell}>{result.title}</td><td style={cell}>{result.artist || "—"}</td><td style={cell}>{result.sourceName}</td><td style={cell}>{result.contentType}</td><td style={cell}><button type="button" onClick={() => startStudio(result)} style={{ ...plainButton, background: "var(--color-primary)", color: "var(--fg-on-accent)" }}>{result.contentType === "source" ? "Open source / paste" : "Use lyrics"}</button></td></tr>)}</tbody></table>
          {filteredResults.length === 0 && <div style={{ padding: 28, textAlign: "center", color: "var(--fg-muted)" }}>{searching ? "Searching sources… results will appear here as they arrive." : "No matches found."}</div>}
        </div>
        <footer style={{ padding: "12px 24px 20px", color: "var(--fg-muted)", fontSize: 12 }} aria-live="polite">
          {searching ? `Searching ${completedCount}/${providers.length} sources · ${results.length} result${results.length === 1 ? "" : "s"} so far` : `${results.length < 3 ? `Search complete; ${results.length} unique result${results.length === 1 ? "" : "s"} found.` : `Search complete · ${results.length} results.`} ${Object.values(status).some((entry) => entry.message) ? Object.values(status).filter((entry) => entry.message).map((entry) => entry.message).join(" · ") : ""}`}
        </footer>
      </section>
      {pasteResult && <div role="presentation" style={{ position: "fixed", inset: 0, zIndex: 1360, display: "grid", placeItems: "center", background: "var(--overlay-backdrop)", padding: 20 }}><section role="dialog" aria-modal="true" aria-label="Paste song lyrics" style={{ width: "min(680px, 95vw)", background: "var(--bg-surface)", borderRadius: 12, padding: 22, display: "grid", gap: 12 }}><h3 style={{ margin: 0 }}>Import from {pasteResult.sourceName}</h3><p style={{ margin: 0, color: "var(--fg-muted)" }}>This source provides a link, not reusable lyric text. Open the source, copy the lyrics you have permission to use, then paste them below.</p><textarea value={pasteText} onChange={(event) => setPasteText(event.target.value)} rows={10} placeholder="Paste lyrics here…" style={{ resize: "vertical", padding: 12, background: "var(--bg-base)", color: "var(--fg-base)", border: "1px solid var(--border-base)", borderRadius: 6 }} /><div style={{ display: "flex", justifyContent: "space-between" }}><a href={pasteResult.sourceUrl} target="_blank" rel="noreferrer" style={{ color: "var(--color-primary)", alignSelf: "center" }}>Open source</a><div style={{ display: "flex", gap: 8 }}><button type="button" style={plainButton} onClick={() => setPasteResult(null)}>Back</button><button type="button" style={{ ...plainButton, background: "var(--color-primary)", color: "var(--fg-on-accent)" }} disabled={!pasteText.trim()} onClick={() => { const result = { ...pasteResult!, text: pasteText.trim(), contentType: "lyrics" as const }; setPasteResult(null); onSelect(result); }}>Import paste</button></div></div></section></div>}
    </div>, document.body,
  );
}

const plainButton: React.CSSProperties = { border: "none", borderRadius: 6, padding: "8px 12px", cursor: "pointer", background: "var(--bg-elevated)", color: "var(--fg-base)", fontWeight: 600 };
const cell: React.CSSProperties = { padding: 10, borderBottom: "1px solid var(--border-base)", verticalAlign: "top" };
