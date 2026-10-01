/**
 * SS-036: choose the congregation display and turn the output on or off.
 *
 * `compact` sits above the Preview/Live split in the projector desk; `full`
 * lives in Settings → Display & Middleware.
 */
import { useEffect, type CSSProperties } from "react";

import { isTauriRuntime, resolveDisplay, type DisplayInfo } from "../lib/projectorOutput";
import { useProjectorOutputStore, type ProjectorOutputStatus } from "../stores/projectorOutputStore";

interface ProjectorOutputControlProps {
  variant?: "compact" | "full";
}

// macOS reports placeholder names like "Monitor #53649"; they mean nothing to an operator.
function hasRealName(display: DisplayInfo): boolean {
  return !/^Monitor #\d+$/.test(display.name) && display.name !== "Display";
}

function displayLabel(display: DisplayInfo, index: number): string {
  const name = hasRealName(display) ? ` — ${display.name}` : "";
  const operator = display.isOperatorDisplay ? " (this screen)" : "";
  return `Display ${index + 1}${name} · ${display.width}×${display.height}${operator}`;
}

function shortName(display: DisplayInfo | null, displays: DisplayInfo[]): string {
  if (!display) return "display";
  if (hasRealName(display)) return display.name;
  const index = displays.findIndex((entry) => entry.id === display.id);
  return index === -1 ? "display" : `Display ${index + 1}`;
}

const STATUS_COLOR: Record<ProjectorOutputStatus, string> = {
  off: "var(--fg-subtle)",
  opening: "var(--color-warning)",
  on: "var(--color-success)",
  "waiting-for-display": "var(--color-warning)",
  error: "var(--color-error)",
};

export function ProjectorOutputControl({ variant = "full" }: ProjectorOutputControlProps) {
  const displays = useProjectorOutputStore((s) => s.displays);
  const selectedDisplayId = useProjectorOutputStore((s) => s.selectedDisplayId);
  const outputEnabled = useProjectorOutputStore((s) => s.outputEnabled);
  const windowed = useProjectorOutputStore((s) => s.windowed);
  const activeDisplay = useProjectorOutputStore((s) => s.activeDisplay);
  const status = useProjectorOutputStore((s) => s.status);
  const error = useProjectorOutputStore((s) => s.error);
  const refreshDisplays = useProjectorOutputStore((s) => s.refreshDisplays);
  const selectDisplay = useProjectorOutputStore((s) => s.selectDisplay);
  const turnOn = useProjectorOutputStore((s) => s.turnOn);
  const turnOff = useProjectorOutputStore((s) => s.turnOff);

  const available = isTauriRuntime();
  const compact = variant === "compact";

  useEffect(() => {
    if (available) void refreshDisplays();
  }, [available, refreshDisplays]);

  const selected = resolveDisplay(displays, selectedDisplayId);
  const fullscreenOn = outputEnabled && !windowed;
  const testWindowOn = outputEnabled && windowed && status === "on";
  const busy = status === "opening";
  const onlyOneDisplay = available && displays.length === 1;
  const selectedIsOperator = Boolean(selected?.isOperatorDisplay);

  const statusText = (() => {
    switch (status) {
      case "opening":
        return "Opening…";
      case "on":
        return windowed ? "Test window open" : `Live on ${shortName(activeDisplay, displays)}`;
      case "waiting-for-display":
        return "Waiting for display — reconnect it";
      case "error":
        return "Output error";
      default:
        return "Output off";
    }
  })();

  const fontSize = compact ? "10px" : "var(--text-xs)";
  const buttonStyle = (tone: "primary" | "neutral" | "danger", disabled: boolean): CSSProperties => ({
    border: tone === "neutral" ? "1px solid var(--border-base)" : "none",
    borderRadius: "var(--radius-md)",
    padding: compact ? "4px 8px" : "7px 12px",
    background: tone === "primary" ? "var(--color-primary)" : tone === "danger" ? "var(--color-error-muted)" : "var(--bg-elevated)",
    color: tone === "primary" ? "var(--fg-on-accent)" : tone === "danger" ? "var(--color-error)" : "var(--fg-base)",
    fontFamily: compact ? "var(--font-mono)" : "var(--font-sans)",
    fontSize,
    fontWeight: 700,
    lineHeight: 1,
    whiteSpace: "nowrap",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
  });

  const select = (
    <select
      aria-label="Congregation output display"
      value={selectedDisplayId ?? ""}
      disabled={!available || busy}
      onFocus={() => void refreshDisplays()}
      onChange={(event) => void selectDisplay(event.target.value || null)}
      style={{
        flex: 1,
        minWidth: compact ? 120 : 220,
        maxWidth: compact ? 320 : undefined,
        background: "var(--bg-elevated)",
        color: "var(--fg-base)",
        border: "1px solid var(--border-base)",
        borderRadius: "var(--radius-md)",
        padding: compact ? "3px 6px" : "8px 10px",
        fontFamily: compact ? "var(--font-mono)" : "var(--font-sans)",
        fontSize,
        textOverflow: "ellipsis",
      }}
    >
      {displays.length === 0 ? <option value="">{available ? "No displays found" : "Desktop app only"}</option> : null}
      {displays.length > 0 && !selectedDisplayId ? <option value="">Choose a display…</option> : null}
      {selectedDisplayId && !selected ? <option value={selectedDisplayId}>Disconnected display</option> : null}
      {displays.map((display, index) => (
        <option key={display.id} value={display.id}>{displayLabel(display, index)}</option>
      ))}
    </select>
  );

  const statusBadge = (
    <span
      role="status"
      aria-live="polite"
      title={error ?? statusText}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--fg-muted)", fontFamily: "var(--font-mono)", fontSize, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: STATUS_COLOR[status], boxShadow: status === "on" ? "0 0 6px var(--color-success)" : "none" }} />
      {statusText}
    </span>
  );

  const mainButton = fullscreenOn ? (
    <button type="button" onClick={() => void turnOff()} disabled={busy} style={buttonStyle("danger", busy)}>
      Turn output off
    </button>
  ) : (
    <button
      type="button"
      onClick={() => void turnOn({ windowed: false })}
      disabled={!available || busy || !selected}
      title={selected ? `Show the live output full screen on ${shortName(selected, displays)}` : "Choose a connected display first"}
      style={buttonStyle("primary", !available || busy || !selected)}
    >
      Show on display
    </button>
  );

  const testButton = (
    <button
      type="button"
      onClick={() => void (testWindowOn ? turnOff() : turnOn({ windowed: true }))}
      disabled={!available || busy}
      title="Open the output in a normal window on this screen, for testing without a second display"
      style={buttonStyle("neutral", !available || busy)}
    >
      {testWindowOn ? "Close test window" : "Test in window"}
    </button>
  );

  const notes: Array<{ tone: "info" | "warning" | "error"; text: string }> = [];
  if (!available) {
    notes.push({ tone: "info", text: "Projector output is available in the SermonSync desktop app." });
  } else {
    if (status === "error" && error) notes.push({ tone: "error", text: error });
    if (status === "waiting-for-display") notes.push({ tone: "warning", text: "The selected display is disconnected. Output is parked and will come back when it is reconnected." });
    if (onlyOneDisplay) notes.push({ tone: "info", text: "Only one display is connected. Connect a projector or TV, or use Test in window." });
    else if (selectedIsOperator) notes.push({ tone: "warning", text: "This is the screen SermonSync is running on. Full-screen output will cover the operator app." });
  }

  const noteColor = { info: "var(--fg-muted)", warning: "var(--color-warning)", error: "var(--color-error)" } as const;

  if (compact) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flexWrap: "wrap" }}>
          <span style={{ color: "var(--fg-muted)", fontFamily: "var(--font-mono)", fontSize: "10px", whiteSpace: "nowrap" }}>OUTPUT :</span>
          {select}
          {mainButton}
          {testButton}
          {statusBadge}
        </div>
        {notes.length > 0 ? (
          <div style={{ color: noteColor[notes[0].tone], fontSize: "10px", lineHeight: 1.35 }}>{notes[0].text}</div>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>{select}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {mainButton}
        {testButton}
        {statusBadge}
      </div>
      {notes.map((note) => (
        <div key={note.text} style={{ color: noteColor[note.tone], fontSize: "var(--text-xs)", lineHeight: 1.4 }}>{note.text}</div>
      ))}
    </div>
  );
}
