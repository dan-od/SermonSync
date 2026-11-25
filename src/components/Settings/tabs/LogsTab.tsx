import { useEffect, useRef, useState, type ReactElement } from "react";

import { getSidecarLogs, type SidecarLogEntry } from "../../../lib/sidecarClient";
import { IconCheckCircle, IconAlertCircle, IconInfo, IconTerminal, IconTrash } from "../icons";
import { SectionIntro, SelectRow, SettingsCard, TextRow } from "../primitives";
import type { SessionLogEntry } from "../types";

const LOG_POLL_INTERVAL_MS = 500;

const LEVEL_ICON: Record<SessionLogEntry["type"], ReactElement> = {
  success: <IconCheckCircle style={{ color: "var(--color-success)" }} />,
  warning: <IconAlertCircle style={{ color: "var(--color-warning)" }} />,
  error: <IconAlertCircle style={{ color: "var(--color-error)" }} />,
  info: <IconInfo style={{ color: "var(--color-info)" }} />,
};

function getLogCategory(logger: string): SessionLogEntry["category"] {
  const name = logger.toLowerCase();
  if (/groq|llm|semantic/.test(name)) return "ai";
  if (/audio|vad|transcription|whisper/.test(name)) return "audio";
  if (/display|projector|middleware/.test(name)) return "display";
  if (/matching|scripture|context/.test(name)) return "detection";
  return "system";
}

function toSessionLogEntry(log: SidecarLogEntry): SessionLogEntry {
  const level = log.level.toLowerCase();
  return {
    id: `${log.time}:${log.level}:${log.logger}:${log.message}`,
    timestamp: log.time,
    type: level === "warning" || level === "warn"
      ? "warning"
      : level === "error" || level === "critical"
        ? "error"
        : "info",
    category: getLogCategory(log.logger),
    message: log.message,
  };
}

function logsEqual(first: SessionLogEntry[], second: SessionLogEntry[]) {
  return first.length === second.length && first.every((log, index) => (
    log.id === second[index]?.id
  ));
}

export function LogsTab({ active = true }: { active?: boolean }) {
  const [logs, setLogs] = useState<SessionLogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [isLive, setIsLive] = useState(false);
  const hiddenLogIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!active) return;
    let mounted = true;
    let timeoutId: number | undefined;

    const poll = async () => {
      try {
        const response = await getSidecarLogs();
        if (!mounted) return;
        setIsLive(true);
        const nextLogs = response.logs
          .map(toSessionLogEntry)
          .filter((log) => !hiddenLogIdsRef.current.has(log.id));
        setLogs((current) => logsEqual(current, nextLogs) ? current : nextLogs);
      } catch {
        if (mounted) setIsLive(false);
      }

      if (mounted) {
        timeoutId = window.setTimeout(() => void poll(), LOG_POLL_INTERVAL_MS);
      }
    };

    void poll();
    return () => {
      mounted = false;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [active]);

  const filtered = logs.filter((log) => {
    const query = search.toLowerCase();
    const matchesSearch = `${log.message} ${log.id} ${log.category}`.toLowerCase().includes(query);
    const matchesCategory = category === "all" || log.category === category;
    return matchesSearch && matchesCategory;
  });

  const clearVisibleLogs = () => {
    for (const log of logs) hiddenLogIdsRef.current.add(log.id);
    setLogs([]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <SectionIntro title="Session Logs" description="Live trace from the SermonSync engine. New entries appear as they are recorded." />

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "var(--space-3)" }}>
        <TextRow label="Search" value={search} onChange={setSearch} placeholder="Search log messages..." />
        <SelectRow
          label="Category"
          value={category}
          onChange={setCategory}
          options={[
            { value: "all", label: "All Categories" },
            { value: "detection", label: "Scripture Detection" },
            { value: "audio", label: "Audio / Worship Detector" },
            { value: "ai", label: "Intelligence Layer" },
            { value: "display", label: "Display / Middleware" },
            { value: "system", label: "System" },
          ]}
        />
      </div>

      <SettingsCard
        icon={<IconTerminal />}
        title="Session Trace"
        badge={
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: isLive ? "var(--color-success)" : "var(--fg-subtle)", fontSize: "10px", fontFamily: "var(--font-mono)" }}>
              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
              {isLive ? "LIVE" : "OFFLINE"}
            </span>
            <button
              type="button"
              onClick={clearVisibleLogs}
              style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: "var(--fg-subtle)", fontSize: "10px", cursor: "pointer" }}
            >
              <IconTrash />
              Clear
            </button>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {filtered.length === 0 ? (
            <p style={{ fontSize: "10px", color: "var(--fg-subtle)", textAlign: "center", padding: "20px 0" }}>
              {isLive ? "Waiting for log entries…" : "Engine logs are unavailable."}
            </p>
          ) : (
            filtered.slice().reverse().map((log) => (
              <div
                key={log.id}
                style={{
                  display: "flex",
                  gap: "10px",
                  padding: "8px 10px",
                  background: "var(--bg-base)",
                  borderRadius: "var(--radius-md)",
                  fontSize: "11px",
                }}
              >
                <span style={{ flexShrink: 0, display: "flex", marginTop: "2px" }}>{LEVEL_ICON[log.type]}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: "8px", fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--fg-subtle)", textTransform: "uppercase" }}>
                    <span>{log.timestamp}</span>
                    <span>[{log.category}]</span>
                  </div>
                  <p style={{ margin: "3px 0 0", color: "var(--fg-muted)", lineHeight: 1.4 }}>{log.message}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </SettingsCard>
    </div>
  );
}
