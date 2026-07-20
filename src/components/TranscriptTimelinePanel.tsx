import { useEffect, useMemo, useRef, useState } from "react";

import type { TranscriptItem } from "./desktop/uiTypes";
import { ScrollArea } from "./ui/ScrollArea";

interface TranscriptTimelinePanelProps {
  items: TranscriptItem[];
  onAddManualTranscript: (text: string) => void;
}

export function TranscriptTimelinePanel({
  items,
  onAddManualTranscript,
}: TranscriptTimelinePanelProps) {
  const [manualText, setManualText] = useState("");
  const [exitingItems, setExitingItems] = useState<TranscriptItem[]>([]);
  const displayedItems = useMemo(() => items.slice(0, 4), [items]);
  const previousItemsRef = useRef<TranscriptItem[]>(displayedItems);

  useEffect(() => {
    const previousItems = previousItemsRef.current;
    const removed = previousItems.filter((prev) => !displayedItems.some((item) => item.id === prev.id));

    if (removed.length > 0) {
      setExitingItems((current) => {
        const existingIds = new Set(current.map((entry) => entry.id));
        const next = removed.filter((entry) => !existingIds.has(entry.id));
        return [...current, ...next];
      });

      const removedIds = new Set(removed.map((entry) => entry.id));
      const timeout = window.setTimeout(() => {
        setExitingItems((current) => current.filter((entry) => !removedIds.has(entry.id)));
      }, 280);

      return () => window.clearTimeout(timeout);
    }

    previousItemsRef.current = displayedItems;
    return undefined;
  }, [displayedItems]);

  useEffect(() => {
    previousItemsRef.current = displayedItems;
  }, [displayedItems]);

  return (
    <div
      style={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        background: "linear-gradient(180deg, rgba(15,18,42,0.86), rgba(10,10,15,0.98))",
        border: "1px solid #1e2b55",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-3)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <style>{`
        .ss-transcript-enter {
          animation: ssTranscriptEnter 260ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .ss-transcript-exit {
          animation: ssTranscriptExit 260ms cubic-bezier(0.4, 0, 1, 1) both;
        }

        @keyframes ssTranscriptEnter {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.985);
            filter: blur(1.5px);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }

        @keyframes ssTranscriptExit {
          from {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
            max-height: 120px;
            margin-bottom: 4px;
          }
          to {
            opacity: 0;
            transform: translateY(-8px) scale(0.985);
            filter: blur(1.5px);
            max-height: 0;
            margin-bottom: 0;
          }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)", minHeight: "28px" }}>
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
                fontSize: "10px",
              letterSpacing: "0.08em",
              color: "#cdd4e8",
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            ⌽ INGESTION TIMELINE
          </div>
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            color: "#7c8bb1",
            letterSpacing: "0.06em",
          }}
        >
          STANDBY
        </div>
      </div>

      <div style={{ height: "1px", background: "#22325f" }} />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const text = manualText.trim();
          if (!text) {
            return;
          }
          onAddManualTranscript(text);
          setManualText("");
        }}
        style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}
      >
        <input
          value={manualText}
          onChange={(event) => setManualText(event.target.value)}
          placeholder="Type or inject transcript (e.g. John 3:16)..."
          style={{
            flex: 1,
            minWidth: 0,
            background: "#111a34",
            color: "#d3d8ea",
            border: "1px solid #243263",
            borderRadius: "var(--radius-md)",
            padding: "9px 11px",
            fontSize: "13px",
          }}
        />
        <button
          type="submit"
          style={{
            width: "36px",
            height: "36px",
            border: "none",
            background: "var(--color-primary)",
            color: "white",
            borderRadius: "999px",
            padding: 0,
            fontFamily: "var(--font-mono)",
            fontSize: "15px",
            cursor: "pointer",
          }}
        >
          ➤
        </button>
      </form>

      <ScrollArea
        style={{ flex: 1, minHeight: 0 }}
        contentStyle={{
          display: "flex",
          flexDirection: "column",
          gap: "3px",
          paddingRight: "2px",
          paddingBottom: "2px",
        }}
      >
        {displayedItems.map((item) => (
          <div
            key={item.id}
            className="ss-transcript-enter"
            style={{
              background: "#151b30",
              padding: "5px 8px",
              borderRadius: 0,
            }}
          >
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", lineHeight: 1.34, color: "#cbd3e9" }}>
              <span style={{ color: "#7f8bad" }}>{item.timestamp} </span>
              <strong style={{ color: "#7f8cff" }}>[TRANSCRIPTION]</strong>{" "}
              <span style={{ fontStyle: "italic" }}>{item.text}</span>
            </div>
          </div>
        ))}

        {exitingItems.map((item) => (
          <div
            key={`exit-${item.id}`}
            className="ss-transcript-exit"
            style={{
              overflow: "hidden",
              background: "#151b30",
              padding: "5px 8px",
              borderRadius: 0,
            }}
          >
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", lineHeight: 1.34, color: "#cbd3e9" }}>
              <span style={{ color: "#7f8bad" }}>{item.timestamp} </span>
              <strong style={{ color: "#7f8cff" }}>[TRANSCRIPTION]</strong>{" "}
              <span style={{ fontStyle: "italic" }}>{item.text}</span>
            </div>
          </div>
        ))}
      </ScrollArea>
    </div>
  );
}
