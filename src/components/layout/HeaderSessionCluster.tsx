import type { SessionStatus } from "../../types/state";

function formatElapsed(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hh = String(Math.floor(safeSeconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((safeSeconds % 3600) / 60)).padStart(2, "0");
  const ss = String(safeSeconds % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function HeaderSessionCluster({
  sessionStatus,
  sessionElapsedSeconds,
  onSessionStart,
  onSessionEnd,
  onOpenSummary,
}: {
  sessionStatus: SessionStatus;
  sessionElapsedSeconds: number;
  onSessionStart: () => void;
  onSessionEnd: () => void;
  onOpenSummary: () => void;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        gap: "14px",
        color: "var(--fg-base)",
      }}
    >
      {[
        "File",
        "Edit",
        "View",
        "Help",
      ].map((item) => (
        <button
          key={item}
          type="button"
          style={{
            border: "none",
            background: "transparent",
            color: "var(--fg-base)",
            padding: "2px 0",
            fontSize: "10px",
            fontWeight: 500,
            letterSpacing: "0.01em",
            opacity: 0.88,
            cursor: "pointer",
          }}
        >
          {item}
        </button>
      ))}
      <span style={{ width: "1px", height: "14px", background: "var(--border-base)", flexShrink: 0 }} />
      <button
        type="button"
        data-no-drag="true"
        className={`ss-header-session${sessionStatus === "active" ? " active" : ""}`}
        onClick={sessionStatus === "active" ? onSessionEnd : onSessionStart}
      >
        {sessionStatus === "active" ? "END SESSION" : "START SESSION"}
      </button>
      <span
        data-no-drag="true"
        style={{
          padding: "4px 8px",
          borderRadius: "4px",
          background: "var(--bg-elevated)",
          color: "var(--fg-base)",
          fontFamily: "var(--font-mono)",
          fontSize: "9px",
          fontWeight: 700,
          letterSpacing: "0.06em",
          lineHeight: 1,
        }}
        aria-label="Session timer"
        title="Session elapsed"
      >
        {formatElapsed(sessionElapsedSeconds)}
      </span>
      <button
        type="button"
        data-no-drag="true"
        className="ss-header-session"
        onClick={onOpenSummary}
        title="Open session summary and history"
      >
        SUMMARY
      </button>
    </div>
  );
}
