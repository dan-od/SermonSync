import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import { getSidecarLogs, type SidecarLogEntry } from "../../lib/sidecarClient";

interface SidecarLogStreamProps {
  onComplete?: () => void;
}

const MAX_DISPLAYED_LOGS = 7;
/** Sidecar can take 10-20s to boot (model load, network fetch). Don't scare
 * the user with a raw fetch error until it's had a real chance to come up. */
const ERROR_DISPLAY_THRESHOLD = 12; // ~6s of failed polls at 500ms each

/** Raw stdout/stderr line forwarded directly from the Rust side. This
 * fires independent of the HTTP /api/logs poll, so a crash/traceback is
 * visible immediately even if the sidecar's HTTP server never binds. */
interface SidecarRawLogEvent {
  stream: "stdout" | "stderr";
  line: string;
}

interface SidecarExitEvent {
  code: number | null;
}

interface SidecarSpawnErrorEvent {
  message: string;
}

function rawLogToEntry(event: SidecarRawLogEvent): SidecarLogEntry {
  const looksLikeError = /error|traceback|exception|failed/i.test(event.line);
  return {
    time: new Date().toLocaleTimeString("en-US", { hour12: false }) + "." + String(new Date().getMilliseconds()).padStart(3, "0"),
    level: looksLikeError ? "ERROR" : "INFO",
    logger: "sermonsync.process",
    message: event.line,
  };
}

function labelForLog(log: SidecarLogEntry) {
  const name = log.logger.split(".").at(-1) ?? "sidecar";
  return `[${name}]`;
}

function progressFor(logs: SidecarLogEntry[], ready: boolean, attempts: number) {
  if (ready) return 100;
  if (logs.length === 0) {
    // Show gentle motion while we wait for the sidecar process to bind its
    // port and emit its first log line, instead of sitting at a static 0%.
    return Math.min(35, Math.round((attempts / 40) * 35));
  }
  return Math.min(95, Math.round((logs.length / MAX_DISPLAYED_LOGS) * 100));
}

/** Displays the live Python logging buffer and polls until the pipeline is ready. */
export function SidecarLogStream({ onComplete }: SidecarLogStreamProps) {
  const [logs, setLogs] = useState<SidecarLogEntry[]>([]);
  const [rawLogs, setRawLogs] = useState<SidecarLogEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);

  // Listen for raw stdout/stderr forwarded directly from the Rust-spawned
  // process, plus hard failure signals (crash / couldn't even spawn). These
  // fire independent of the HTTP poll below, so a startup crash is visible
  // immediately instead of only after several seconds of "Failed to fetch".
  useEffect(() => {
    let active = true;
    const unlistenPromises = [
      listen<SidecarRawLogEvent>("sidecar://log", (event) => {
        if (!active) return;
        setRawLogs((prev) => [...prev.slice(-(MAX_DISPLAYED_LOGS * 4)), rawLogToEntry(event.payload)]);
      }),
      listen<SidecarExitEvent>("sidecar://exit", (event) => {
        if (!active) return;
        setError(
          `Sidecar process exited unexpectedly${event.payload.code !== null ? ` (exit code ${event.payload.code})` : ""}. See logs above.`,
        );
      }),
      listen<SidecarSpawnErrorEvent>("sidecar://spawn-error", (event) => {
        if (!active) return;
        setError(event.payload.message);
      }),
    ];

    return () => {
      active = false;
      unlistenPromises.forEach((promise) => {
        promise.then((unlisten) => unlisten()).catch(() => undefined);
      });
    };
  }, []);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    let attempts = 0;

    const poll = async () => {
      try {
        const response = await getSidecarLogs();
        if (!active) return;
        attempts = 0;
        setFailedAttempts(0);
        setLogs(response.logs);
        setReady(response.ready);
        setError(null);
        if (response.ready) {
          onComplete?.();
          return;
        }
      } catch (pollError: unknown) {
        if (!active) return;
        attempts += 1;
        setFailedAttempts(attempts);
        // While the sidecar process is still spinning up, connection
        // refused/"Load failed" errors are expected — don't surface the raw
        // browser error text until it's been failing for a while.
        setError(
          attempts >= ERROR_DISPLAY_THRESHOLD
            ? pollError instanceof Error
              ? pollError.message
              : "Waiting for the sidecar..."
            : null,
        );
      }
      timer = window.setTimeout(() => void poll(), 500);
    };

    void poll();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [onComplete]);

  // The FastAPI structured log buffer (`logs`) is the source of truth once
  // it starts flowing. Before that — e.g. an import error or crash before
  // logging is even configured — fall back to the raw process output so the
  // real failure reason is visible instead of a blank "starting..." screen.
  const combinedLogs = logs.length > 0 ? logs : rawLogs;
  const visibleLogs = combinedLogs.slice(-MAX_DISPLAYED_LOGS);
  const progress = progressFor(combinedLogs, ready, failedAttempts);


  return (
    <div style={{ width: "100%", maxWidth: "48rem", height: 150, margin: "0 auto", fontFamily: "var(--font-mono)" }}>
      <div
        className="ss-scroll-viewport"
        style={{ height: 112, overflow: "hidden", padding: "4px 16px", color: "rgba(232, 232, 240, 0.7)", fontSize: "var(--text-xs)", lineHeight: 1.6 }}
      >
        {visibleLogs.map((log, index) => (
          <div key={`${log.time}-${log.logger}-${index}`} className="ss-launch-log-line" style={{ display: "flex", gap: 10, whiteSpace: "nowrap", overflow: "hidden" }}>
            <span style={{ color: "rgba(232, 232, 240, 0.35)", flexShrink: 0 }}>{log.time}</span>
            <span style={{ color: log.level === "ERROR" ? "var(--color-error)" : "#a78bfa", fontWeight: 600, flexShrink: 0 }}>{labelForLog(log)}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", color: "rgba(232, 232, 240, 0.82)" }}>{log.message}</span>
          </div>
        ))}
        {error && <div style={{ color: "var(--color-warning)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{error}</div>}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px 0", fontSize: 10, color: "var(--fg-muted)" }}>
        <span style={{ flex: 1, height: 5, display: "flex", gap: 3 }} aria-label={`Sidecar loading ${progress}%`}>
          {Array.from({ length: 24 }, (_, index) => (
            <span key={index} style={{ flex: 1, background: index < Math.round((progress / 100) * 24) ? "var(--color-primary)" : "var(--bg-elevated)", transition: "background 0.25s ease" }} />
          ))}
        </span>
        <span style={{ minWidth: 34, textAlign: "right", color: ready ? "var(--color-success)" : "var(--fg-base)" }}>{progress}%</span>
      </div>

      <div style={{ padding: "4px 16px", fontSize: 10, color: ready ? "var(--color-success)" : "var(--fg-subtle)", fontStyle: "italic" }}>
        {ready ? "sidecar pipeline ready" : combinedLogs.length > 0 ? "streaming sidecar logs..." : "starting sidecar process..."}
      </div>
    </div>
  );
}
