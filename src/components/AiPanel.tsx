import { useMemo, useState } from "react";

import type { TranscriptItem } from "./desktop/uiTypes";

interface AiPanelProps {
  items: TranscriptItem[];
  pendingCount: number;
}

export function AiPanel({ items, pendingCount }: AiPanelProps) {
  const transcriptText = useMemo(() => items.map((item) => item.text).join(" "), [items]);
  const summary = useMemo(() => {
    const emphasis = items.flatMap((item) => item.matches).slice(0, 3);
    return {
      theme: emphasis.length > 0 ? emphasis.join(" · ") : "Faithful proclamation and response",
      narrative:
        transcriptText ||
        "No live transcript has been captured yet. Use the left panel to inject transcript text and generate the workspace.",
      takeaways: [
        "Move the strongest scripture cue to preview before sending it live.",
        "Keep the operator notes aligned with the sermon pivot points.",
        `Current pending suggestion load: ${pendingCount}.`,
      ],
    };
  }, [items, pendingCount, transcriptText]);

  const [notes, setNotes] = useState(
    [
      "# Sermon Notes Workspace",
      "",
      "## Main burden",
      "- Capture the core passage and the supporting scripture chain.",
      "",
      "## Congregational actions",
      "- Prepare the next verse before the current one leaves screen.",
    ].join("\n"),
  );

  return (
    <div style={{ height: "100%", minHeight: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
      <section
        style={{
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-4)",
        }}
      >
        <div>
          <div style={{ color: "var(--color-primary)", fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", letterSpacing: "0.08em" }}>
            SERMON NOTES
          </div>
          <div style={{ color: "var(--fg-subtle)", fontSize: "var(--text-sm)" }}>
            Archive-inspired notepad workspace for operator prep
          </div>
        </div>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          style={{
            flex: 1,
            minHeight: 0,
            resize: "none",
            background: "var(--bg-base)",
            color: "var(--fg-base)",
            border: "1px solid var(--border-base)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-3)",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-xs)",
            lineHeight: 1.6,
          }}
        />
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <button
            type="button"
            onClick={() => setNotes((value) => `${value}\n\n## Transcript excerpt\n${transcriptText}`)}
            style={{
              flex: 1,
              border: "1px solid var(--border-base)",
              background: "var(--bg-elevated)",
              color: "var(--fg-base)",
              borderRadius: "var(--radius-md)",
              padding: "10px 12px",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-xs)",
              cursor: "pointer",
            }}
          >
            APPEND TRANSCRIPT
          </button>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(notes)}
            style={{
              border: "1px solid var(--color-primary)",
              background: "var(--color-primary)",
              color: "white",
              borderRadius: "var(--radius-md)",
              padding: "10px 12px",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-xs)",
              cursor: "pointer",
            }}
          >
            COPY
          </button>
        </div>
      </section>

      <section
        style={{
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-4)",
        }}
      >
        <div>
          <div style={{ color: "var(--color-primary)", fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", letterSpacing: "0.08em" }}>
            AI SUMMARY PANEL
          </div>
          <div style={{ color: "var(--fg-subtle)", fontSize: "var(--text-sm)" }}>
            Structured summary view adapted from the archive panel
          </div>
        </div>

        <div style={{ background: "var(--bg-base)", border: "1px solid var(--border-base)", borderRadius: "var(--radius-md)", padding: "var(--space-4)" }}>
          <div style={{ color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>Theme</div>
          <div style={{ color: "var(--fg-base)", fontSize: "var(--text-lg)", marginTop: "var(--space-2)" }}>{summary.theme}</div>
        </div>

        <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", lineHeight: 1.6 }}>{summary.narrative}</div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {summary.takeaways.map((takeaway) => (
            <div
              key={takeaway}
              style={{
                background: "var(--bg-base)",
                border: "1px solid var(--border-base)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-3)",
                color: "var(--fg-base)",
                fontSize: "var(--text-sm)",
              }}
            >
              {takeaway}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
