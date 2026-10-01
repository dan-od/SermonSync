import type { Dispatch, SetStateAction } from "react";
import { SONG_TAG_PATTERN } from "./songStudioText";
import { tagColor } from "./tagColor";

export function ProjectionCueDialog({
  cueOrder,
  setCueOrder,
  setCueModalOpen,
  createProjectionCue,
}: {
  cueOrder: string;
  setCueOrder: Dispatch<SetStateAction<string>>;
  setCueModalOpen: Dispatch<SetStateAction<boolean>>;
  createProjectionCue: () => void;
}) {
  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setCueModalOpen(false);
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1300,
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: "var(--overlay-backdrop)",
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="projection-cue-title"
        style={{
          width: "min(460px, 94vw)",
          maxHeight: "min(620px, 88vh)",
          overflow: "auto",
          padding: 20,
          borderRadius: "var(--radius-lg)",
          background: "var(--bg-surface)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <h2 id="projection-cue-title" style={{ margin: 0, color: "var(--fg-base)", fontSize: 17 }}>
          Create projection cue
        </h2>
        <p style={{ margin: "8px 0 16px", color: "var(--fg-muted)", fontSize: 12, lineHeight: 1.5 }}>
          Enter one manually assigned tag per line. Each tag includes the slides until the next tag; unlabeled slides receive a sub-tag, and repeated identical ranges in the song are treated as one sequence. Remove sections or repeat tags to build the cue in your own order. Use {"{song_title}"} when the cue needs the song title.
        </p>
        <textarea
          value={cueOrder}
          aria-label="Projection cue tag order"
          placeholder="[Verse 1]\n[Chorus]\n[Verse 2]\n[Chorus]"
          onChange={(event) => setCueOrder(event.target.value)}
          style={{
            width: "100%",
            minHeight: 220,
            boxSizing: "border-box",
            border: "none",
            borderRadius: "var(--radius-sm)",
            background: "var(--bg-base)",
            color: "var(--fg-base)",
            padding: "12px",
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            lineHeight: 1.6,
            resize: "vertical",
            outline: "none",
          }}
        />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {cueOrder.split("\n").map((line, index) => {
              const tag = line.trim().match(SONG_TAG_PATTERN)?.[1].trim() ?? line.trim();
              if (!tag) return null;
              return (
                <span
                  key={`${tag}-${index}`}
                  style={{
                    padding: "3px 7px",
                    borderRadius: "var(--radius-sm)",
                    background: tagColor(tag),
                    color: "var(--fg-on-accent)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {tag}
                </span>
              );
            })}
          </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button
            type="button"
            onClick={() => setCueModalOpen(false)}
            style={{
              padding: "8px 13px",
              border: "none",
              borderRadius: 6,
              background: "var(--bg-elevated)",
              color: "var(--fg-base)",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={createProjectionCue}
            disabled={!cueOrder.trim()}
            style={{
              padding: "8px 13px",
              border: "none",
              borderRadius: 6,
              background: "var(--color-primary)",
              color: "var(--fg-on-accent)",
              cursor: cueOrder.trim() ? "pointer" : "not-allowed",
              fontSize: 12,
              fontWeight: 600,
              opacity: cueOrder.trim() ? 1 : 0.5,
            }}
          >
            Create cue
          </button>
        </div>
      </section>
    </div>
  );
}
