import { useEffect, useMemo, useRef, useState } from "react";

import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

import { getSessionHistory, getSessionSummary, getSidecarHttpBase, saveSessionSummary, type SessionHistoryItem } from "../lib/sidecarClient";
import type { SuggestionCard, TranscriptItem } from "../types/state";
import { Dropdown } from "./Settings/primitives";

interface SessionSummaryPanelProps {
  items: TranscriptItem[];
  cards: SuggestionCard[];
  sessionStatus: "idle" | "active" | "paused" | "ended";
  sessionElapsedSeconds: number;
  sessionId?: string | null;
}

type SummaryView = "draft" | "generated" | "history";
type ExportFormat = "txt" | "md";

function formatElapsed(seconds: number) {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  return `${minutes} min`;
}

export function SessionSummaryPanel({ items, cards, sessionStatus, sessionElapsedSeconds, sessionId }: SessionSummaryPanelProps) {
  const [view, setView] = useState<SummaryView>("draft");
  const storageKey = `sermonsync-summary:${sessionId ?? sessionStatus}`;
  const [savedSummary] = useState(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) as { title?: string; draft?: string; generated?: string } : {};
    } catch {
      return {};
    }
  });
  const [title, setTitle] = useState(savedSummary.title ?? "");
  const [draft, setDraft] = useState(savedSummary.draft ?? "");
  const [generated, setGenerated] = useState(savedSummary.generated ?? "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("md");
  const [isSaving, setIsSaving] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [archiveMessage, setArchiveMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<SessionHistoryItem[]>([]);
  const archiveHydrated = useRef(!sessionId);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify({ title, draft, generated }));
  }, [draft, generated, storageKey, title]);

  useEffect(() => {
    archiveHydrated.current = !sessionId;
    if (!sessionId) return;
    let cancelled = false;
    void getSessionSummary(sessionId)
      .then(({ summary }) => {
        if (cancelled) return;
        if (summary) {
          setTitle(summary.title);
          setDraft(summary.draft);
          setGenerated(summary.generated);
        }
        archiveHydrated.current = true;
      })
      .catch(() => {
        if (!cancelled) {
          archiveHydrated.current = true;
          setArchiveMessage("Archive sync unavailable; keeping this summary on the device.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !archiveHydrated.current) return;
    const timeoutId = window.setTimeout(() => {
      void saveSessionSummary(sessionId, { title, draft, generated })
        .then(() => setArchiveMessage("Saved to session history."))
        .catch(() => setArchiveMessage("Archive sync unavailable; keeping this summary on the device."));
    }, 400);
    return () => window.clearTimeout(timeoutId);
  }, [draft, generated, sessionId, title]);

  useEffect(() => {
    if (view !== "history") return;
    void getSessionHistory()
      .then(({ sessions }) => setHistory(sessions))
      .catch(() => setHistory([]));
  }, [view]);

  const transcript = useMemo(() => items.map((item) => item.text).join(" "), [items]);
  const scriptures = useMemo(
    () => cards.filter((card, index, all) => all.findIndex((entry) => entry.id === card.id) === index),
    [cards],
  );
  const statusLabel = sessionStatus === "active" ? "LIVE SESSION" : sessionStatus === "ended" ? "ARCHIVED SESSION" : "SESSION DRAFT";

  const generateSummary = () => {
    setIsGenerating(true);
    window.setTimeout(() => {
      const source = draft.trim() || transcript.trim() || "No operator notes have been added yet.";
      const references = scriptures.slice(0, 8).map((card) => `${card.reference.book} ${card.reference.chapter}:${card.reference.verse}`).join(", ");
      setGenerated([
        `Summary\n${source}`,
        "\nMain points\n- Review the central burden of the message.\n- Connect the cited scriptures to the congregation's response.",
        `\nScriptures\n${references || "No scripture suggestions recorded yet."}`,
        "\nDevotional guide\nReflection: Revisit the message and its central invitation.\nApplication: Identify one faithful response for the week.\nPrayer: Ask for grace to live out what was heard.",
      ].join("\n"));
      setIsGenerating(false);
      setView("generated");
    }, 450);
  };

  const formatDeterministically = () => {
    const source = generated.trim() || draft.trim() || transcript.trim() || "No summary content captured.";
    const heading = title.trim() || "Session Summary";
    if (exportFormat === "md") {
      return `# ${heading}\n\n${source}`;
    }
    return `${heading}\n${"=".repeat(heading.length)}\n\n${source.replace(/^#{1,6}\s+/gm, "").replace(/\*\*(.*?)\*\*/g, "$1")}`;
  };

  const formatForExport = async () => {
    const fallback = formatDeterministically();
    try {
      const response = await fetch(`${getSidecarHttpBase()}/api/archive/format`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: fallback, format: exportFormat }),
      });
      if (!response.ok) return fallback;
      const payload = await response.json() as { content?: unknown };
      return typeof payload.content === "string" && payload.content.trim() ? payload.content.trim() : fallback;
    } catch {
      return fallback;
    }
  };

  const saveToDevice = async () => {
    setIsSaving(true);
    setExportMessage(null);
    try {
      const contents = await formatForExport();
      const extension = exportFormat;
      const selectedPath = await save({
        defaultPath: `${(title.trim() || "session-summary").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.${extension}`,
        filters: [{ name: extension === "md" ? "Markdown" : "Plain text", extensions: [extension] }],
      });
      if (!selectedPath) return;
      await invoke("save_text_file", { path: selectedPath, contents });
      setExportMessage(`Saved ${extension.toUpperCase()} to device.`);
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "Could not save the summary.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ height: "100%", minHeight: 0, display: "grid", gridTemplateColumns: "minmax(210px, 0.32fr) minmax(0, 1fr)", background: "var(--bg-base)" }}>
      <aside style={{ minWidth: 0, display: "flex", flexDirection: "column", background: "var(--bg-surface)", padding: "22px 18px" }}>
        <div style={{ color: "var(--color-primary)", fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.16em", fontWeight: 700 }}>SESSION WORKSPACE</div>
        <h1 style={{ margin: "12px 0 4px", color: "var(--fg-base)", fontSize: "22px", letterSpacing: "0.01em" }}>Summary</h1>
        <p style={{ margin: 0, color: "var(--fg-subtle)", fontSize: "12px", lineHeight: 1.5 }}>Shape the record while the service is still fresh.</p>

        <nav style={{ display: "grid", gap: "4px", marginTop: "30px" }} aria-label="Summary views">
          {([
            ["draft", "SESSION DRAFT"],
            ["generated", "AI SUMMARY"],
            ["history", "HISTORY"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              style={{ border: "none", borderLeft: view === id ? "3px solid var(--color-primary)" : "3px solid transparent", background: view === id ? "var(--color-primary-muted)" : "transparent", color: view === id ? "var(--color-primary)" : "var(--fg-muted)", padding: "10px 12px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer" }}
            >
              {label}
            </button>
          ))}
        </nav>

        <div style={{ marginTop: "auto", paddingTop: "24px", color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", fontSize: "10px", lineHeight: 1.8 }}>
          <div>{statusLabel}</div>
          <div>{formatElapsed(sessionElapsedSeconds)} captured</div>
          <div>{items.length} transcript entries</div>
          <div>{scriptures.length} scripture cues</div>
        </div>
      </aside>

      <main style={{ minWidth: 0, minHeight: 0, overflow: "auto", padding: "26px 30px", background: "var(--bg-base)" }}>
        {view === "history" ? (
          <HistoryPlaceholder history={history} />
        ) : (
          <div style={{ maxWidth: "920px", display: "grid", gap: "24px" }}>
            <header style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: "18px" }}>
              <div>
                <div style={{ color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.14em" }}>{view === "draft" ? "EDIT BEFORE GENERATION" : "EDIT AFTER GENERATION"}</div>
                <h2 style={{ margin: "8px 0 0", color: "var(--fg-base)", fontSize: "24px", fontWeight: 650 }}>{view === "draft" ? "Build the session record" : "Refine the generated guide"}</h2>
              </div>
              {view === "draft" ? (
                <button type="button" onClick={generateSummary} disabled={isGenerating} style={{ border: "none", background: "var(--color-primary)", color: "var(--fg-on-accent)", padding: "10px 15px", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 800, letterSpacing: "0.06em", cursor: isGenerating ? "wait" : "pointer", opacity: isGenerating ? 0.65 : 1 }}>
                  {isGenerating ? "GENERATING..." : "GENERATE AI SUMMARY"}
                </button>
              ) : (
                <button type="button" onClick={() => setView("draft")} style={{ border: "none", background: "var(--bg-elevated)", color: "var(--fg-muted)", padding: "10px 15px", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 800, letterSpacing: "0.06em", cursor: "pointer" }}>BACK TO DRAFT</button>
              )}
            </header>

            {view === "draft" ? (
              <section style={{ display: "grid", gap: "18px" }}>
                <label style={{ display: "grid", gap: "8px", color: "var(--fg-muted)", fontSize: "11px" }}>
                  Working title
                  <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What was this service about?" style={{ border: "none", borderBottom: "1px solid var(--border-base)", borderRadius: 0, background: "transparent", color: "var(--fg-base)", padding: "10px 0", outline: "none", fontSize: "20px" }} />
                </label>
                <label style={{ display: "grid", gap: "8px", color: "var(--fg-muted)", fontSize: "11px" }}>
                  Operator summary
                  <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Capture the burden, turning points, and response while they are still clear..." style={{ minHeight: "280px", resize: "vertical", border: "none", borderLeft: "3px solid var(--color-primary)", background: "var(--bg-surface)", color: "var(--fg-base)", padding: "18px", outline: "none", lineHeight: 1.7 }} />
                </label>
                <div style={{ color: "var(--fg-subtle)", fontSize: "12px", lineHeight: 1.6 }}>
                  AI generation uses this draft together with the live transcript and scripture cues. Nothing is generated when this page opens.
                </div>
              </section>
            ) : (
              <section style={{ display: "grid", gap: "18px" }}>
                <label style={{ display: "grid", gap: "8px", color: "var(--fg-muted)", fontSize: "11px" }}>
                  Generated title
                  <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Generated title" style={{ border: "none", borderBottom: "1px solid var(--border-base)", borderRadius: 0, background: "transparent", color: "var(--fg-base)", padding: "10px 0", outline: "none", fontSize: "20px" }} />
                </label>
                <label style={{ display: "grid", gap: "8px", color: "var(--fg-muted)", fontSize: "11px" }}>
                  AI summary and devotional guide
                  <textarea value={generated} onChange={(event) => setGenerated(event.target.value)} style={{ minHeight: "430px", resize: "vertical", border: "none", borderLeft: "3px solid var(--color-primary)", background: "var(--bg-surface)", color: "var(--fg-base)", padding: "18px", outline: "none", lineHeight: 1.7 }} />
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button type="button" onClick={() => navigator.clipboard.writeText(`${title}\n\n${generated}`)} style={{ border: "none", background: "var(--bg-elevated)", color: "var(--fg-muted)", padding: "9px 12px", fontFamily: "var(--font-mono)", fontSize: "10px", cursor: "pointer" }}>COPY</button>
                  <button type="button" onClick={generateSummary} style={{ border: "none", background: "transparent", color: "var(--color-primary)", padding: "9px 12px", fontFamily: "var(--font-mono)", fontSize: "10px", cursor: "pointer" }}>REGENERATE</button>
                </div>
              </section>
            )}
            <section style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px", paddingTop: "6px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", fontSize: "10px" }}>
                <span>SAVE AS</span>
                <Dropdown
                  value={exportFormat}
                  options={[{ value: "md", label: ".md Markdown" }, { value: "txt", label: ".txt Plain text" }]}
                  onChange={(value) => setExportFormat(value as ExportFormat)}
                  containerStyle={{ width: "150px" }}
                  triggerStyle={{ background: "var(--color-primary)", border: "none", borderRadius: "var(--radius-md)", color: "var(--fg-on-accent)", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 800, height: "32px", padding: "9px 13px" }}
                  optionStyle={{ fontFamily: "var(--font-mono)", fontSize: "10px", padding: "9px 13px" }}
                />
              </div>
              <button type="button" onClick={() => void saveToDevice()} disabled={isSaving} style={{ border: "none", background: "var(--color-primary)", color: "var(--fg-on-accent)", padding: "9px 13px", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 800, cursor: isSaving ? "wait" : "pointer", opacity: isSaving ? 0.65 : 1 }}>
                {isSaving ? "PREPARING..." : "SAVE TO DEVICE"}
              </button>
              {exportMessage ? <span style={{ color: "var(--fg-subtle)", fontSize: "11px" }}>{exportMessage}</span> : null}
              {archiveMessage ? <span style={{ color: "var(--fg-subtle)", fontSize: "11px" }}>{archiveMessage}</span> : null}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function HistoryPlaceholder({ history }: { history: SessionHistoryItem[] }) {
  return (
    <section style={{ maxWidth: "920px" }}>
      <div style={{ color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.14em" }}>ARCHIVED SERVICES</div>
      <h2 style={{ margin: "8px 0 6px", color: "var(--fg-base)", fontSize: "24px" }}>History</h2>
      <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: "13px", lineHeight: 1.6 }}>Past sessions will appear here with their transcript, scripture cues, operator actions, and saved summary.</p>
      {history.length === 0 ? (
        <div style={{ marginTop: "28px", padding: "18px 0", borderTop: "1px solid var(--border-base)", color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", fontSize: "11px" }}>No archived sessions loaded yet.</div>
      ) : (
        <div style={{ display: "grid", gap: "4px", marginTop: "28px" }}>
          {history.map((session) => (
            <div key={session.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "13px 0", borderTop: "1px solid var(--border-base)" }}>
              <div>
                <div style={{ color: "var(--fg-base)", fontSize: "13px" }}>{new Date(session.started_at * 1000).toLocaleString()}</div>
                <div style={{ color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", fontSize: "10px", marginTop: "4px" }}>{session.unit_name || session.unit_id || "Unassigned unit"} · {formatElapsed(session.elapsed_seconds)} · {session.event_count} events</div>
              </div>
              <span style={{ color: "var(--color-primary)", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700 }}>{session.status.toUpperCase()}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
