/**
 * Three-panel application shell (SS-007 scaffold).
 *
 *   Q1 (~25%)  Ingestion Timeline        — SS-014 / SS-023 etc.
 *   Q2 (~45%)  Co-Pilot Suggestion Deck  — SS-024 … SS-029
 *   Q3 (~30%)  Projector + Command Desk  — SS-030 … SS-043
 *
 * Panels are resizable. Dee owns the real panel contents — these are labelled
 * placeholders so the bones are in place.
 */
import { Group, Panel, Separator } from "react-resizable-panels";

import { HeaderBar } from "./HeaderBar";
import { StatusBar } from "./StatusBar";

function PanelPlaceholder({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--space-2)",
        background: "var(--bg-base)",
        color: "var(--fg-muted)",
        textAlign: "center",
        padding: "var(--space-4)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-xs)",
          letterSpacing: "0.1em",
          color: "var(--color-primary)",
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-subtle)" }}>
        {subtitle}
      </div>
    </div>
  );
}

function ResizeHandle() {
  return (
    <Separator
      style={{
        width: "4px",
        background: "var(--border-base)",
        cursor: "col-resize",
      }}
    />
  );
}

export function AppLayout() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <HeaderBar />
      <div style={{ flex: 1, minHeight: 0 }}>
        <Group orientation="horizontal" style={{ height: "100%" }}>
          <Panel defaultSize="25%" minSize="15%">
            <PanelPlaceholder title="Q1 · INGESTION TIMELINE" subtitle="Live transcript & VAD stream" />
          </Panel>
          <ResizeHandle />
          <Panel defaultSize="45%" minSize="25%">
            <PanelPlaceholder title="Q2 · CO-PILOT SUGGESTION DECK" subtitle="Scripture matches from the 4-stage pipeline" />
          </Panel>
          <ResizeHandle />
          <Panel defaultSize="30%" minSize="20%">
            <PanelPlaceholder title="Q3 · PROJECTOR + COMMAND DESK" subtitle="Output preview & manual controls" />
          </Panel>
        </Group>
      </div>
      <StatusBar />
    </div>
  );
}
