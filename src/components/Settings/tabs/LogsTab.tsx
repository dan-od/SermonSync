import { useState, type ReactElement } from "react";

import { IconCheckCircle, IconAlertCircle, IconInfo, IconTerminal, IconTrash } from "../icons";
import { SectionIntro, SelectRow, SettingsCard, TextRow } from "../primitives";
import { MOCK_SESSION_LOGS, type SessionLogEntry } from "../types";

const LEVEL_ICON: Record<SessionLogEntry["type"], ReactElement> = {
  success: <IconCheckCircle style={{ color: "var(--color-success)" }} />,
  warning: <IconAlertCircle style={{ color: "var(--color-warning)" }} />,
  error: <IconAlertCircle style={{ color: "var(--color-error)" }} />,
  info: <IconInfo style={{ color: "var(--color-info)" }} />,
};

export function LogsTab() {
  const [logs, setLogs] = useState<SessionLogEntry[]>(MOCK_SESSION_LOGS);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const filtered = logs.filter((log) => {
    const matchesSearch = log.message.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === "all" || log.category === category;
    return matchesSearch && matchesCategory;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <SectionIntro title="Session Logs" description="Audit trail of detection events, audio mode switches, and intelligence layer calls." />

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
          <button
            type="button"
            onClick={() => setLogs([])}
            style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: "var(--fg-subtle)", fontSize: "10px", cursor: "pointer" }}
          >
            <IconTrash />
            Clear
          </button>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {filtered.length === 0 ? (
            <p style={{ fontSize: "10px", color: "var(--fg-subtle)", textAlign: "center", padding: "20px 0" }}>No matching log entries.</p>
          ) : (
            filtered.map((log) => (
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
