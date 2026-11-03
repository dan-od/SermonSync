import { MAC_TRAFFIC_LIGHT_INSET, USE_NATIVE_WINDOW_CONTROLS, isMacOS } from "../../lib/platform";
import type { OverlayMode, SessionStatus, UiTheme } from "../../types/state";
import { useProjectorStore } from "../../stores/projectorStore";
import { FeedOverrideControl, ScreenLayoutControl, SettingsButton, ThemeToggle } from "./HeaderControls";
import { HeaderMenuBar } from "./HeaderMenuBar";
import { HeaderWindowControls } from "./HeaderWindowControls";
import { SessionClock } from "./SessionClock";
import { headerChrome } from "./headerChrome";
import type { HeaderMenuEntry, HeaderMenuName } from "./headerBarUtils";
import { useHeaderWindow } from "./useHeaderWindow";

export interface HeaderBarProps {
  onOverlayModeChange: (mode: OverlayMode) => void;
  feedOverride: "live" | "logo" | "black" | "clear";
  onFeedOverrideChange: (mode: "live" | "logo" | "black" | "clear") => void;
  uiTheme: UiTheme;
  onUiThemeChange: (theme: UiTheme) => void;
  sessionStatus: SessionStatus;
  onSessionStart: () => void;
  onSessionEnd: () => void;
  onSync?: () => void;
  onOpenSummary: () => void;
  onOpenNotes: () => void;
  onOpenSettings: () => void;
  onOpenPresetDownloads: () => void;
}

export function HeaderBar({
  onOverlayModeChange,
  feedOverride,
  onFeedOverrideChange,
  uiTheme,
  onUiThemeChange,
  sessionStatus,
  onSessionStart,
  onSessionEnd,
  onSync,
  onOpenSummary,
  onOpenNotes,
  onOpenSettings,
  onOpenPresetDownloads,
}: HeaderBarProps) {
  const overlayMode = useProjectorStore((s) => s.overlayMode);
  const { isTauriWindow, handleHeaderMouseDown, handleHeaderDoubleClick, windowControls } = useHeaderWindow();
  const sessionInProgress = sessionStatus === "active" || sessionStatus === "paused";
  // The OS now draws the window controls (native decorations per-OS), so the
  // app hides its own. On macOS the traffic lights overlay the bar's top-left.
  const showCustomControls = isTauriWindow && !USE_NATIVE_WINDOW_CONTROLS;
  const macInset = isTauriWindow && isMacOS();

  const menuEntries: Record<HeaderMenuName, HeaderMenuEntry[]> = {
    File: [
      { kind: "action", label: "Session Summary", onSelect: onOpenSummary },
      { kind: "separator" },
      {
        kind: "action",
        label: sessionInProgress ? "End Session" : "Start Session",
        onSelect: sessionInProgress ? onSessionEnd : onSessionStart,
      },
    ],
    Edit: [
      { kind: "action", label: "Open Notes", onSelect: onOpenNotes },
      { kind: "action", label: "Settings", onSelect: onOpenSettings },
    ],
    View: [
      ...([
        ["widescreen", "Widescreen Slide"],
        ["lower-third", "Lower Third"],
        ["split-screen", "Split Screen"],
      ] as const).map(([mode, label]) => ({
        kind: "action" as const,
        label,
        checked: overlayMode === mode,
        onSelect: () => onOverlayModeChange(mode),
      })),
      { kind: "separator" },
      ...([
        ["live", "Live Feed"],
        ["logo", "Logo Feed"],
        ["black", "Black Feed"],
        ["clear", "Clear Feed"],
      ] as const).map(([mode, label]) => ({
        kind: "action" as const,
        label,
        checked: feedOverride === mode,
        onSelect: () => onFeedOverrideChange(mode),
      })),
    ],
    Help: [
      { kind: "action", label: "Download App Presets", onSelect: onOpenPresetDownloads },
      { kind: "separator" },
      { kind: "action", label: "Help & About", onSelect: onOpenSettings },
    ],
  };

  return (
    <>
    <style>{headerChrome}</style>
    <header
      onMouseDown={handleHeaderMouseDown}
      onDoubleClick={handleHeaderDoubleClick}
      style={{
        display: "grid",
        gridTemplateColumns: showCustomControls ? "1fr 1fr auto" : "1fr 1fr",
        alignItems: "center",
        gap: "12px",
        padding: `0 12px 0 ${macInset ? MAC_TRAFFIC_LIGHT_INSET : 12}px`,
        height: "34px",
        background: "var(--bg-surface)",
        borderBottom: "none",
        fontSize: "var(--text-xs)",
        userSelect: "none",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          gap: "14px",
          color: "var(--fg-base)",
        }}
      >
        <HeaderMenuBar menuEntries={menuEntries} />
        <span style={{ width: "1px", height: "14px", background: "var(--border-base)", flexShrink: 0 }} />
        <button
          type="button"
          data-no-drag="true"
          className={`ss-header-session${sessionInProgress ? " active" : ""}`}
          onClick={sessionInProgress ? onSessionEnd : onSessionStart}
        >
          {sessionInProgress ? "END SESSION" : "START SESSION"}
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
          <SessionClock />
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
        <span style={{ width: "1px", height: "14px", background: "var(--border-base)", flexShrink: 0 }} />
        <span
          data-no-drag="true"
          style={{
            padding: "4px 7px",
            borderRadius: "4px",
            background: "var(--bg-elevated)",
            color: "var(--fg-muted)",
            fontFamily: "var(--font-mono)",
            fontSize: "9px",
            fontWeight: 700,
            letterSpacing: "0.04em",
            lineHeight: 1,
          }}
        >
          OFFLINE MODE
        </span>
        <button
          type="button"
          data-no-drag="true"
          onClick={() => onSync?.()}
          style={{
            border: "none",
            borderRadius: "4px",
            background: "var(--bg-elevated)",
            color: "var(--fg-base)",
            padding: "4px 8px",
            fontFamily: "var(--font-mono)",
            fontSize: "9px",
            fontWeight: 700,
            letterSpacing: "0.06em",
            lineHeight: 1,
            cursor: "pointer",
          }}
        >
          SYNC
        </button>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: "8px",
        }}
      >
        <ScreenLayoutControl overlayMode={overlayMode} onOverlayModeChange={onOverlayModeChange} />

        <span style={{ width: "1px", height: "14px", background: "var(--border-base)", flexShrink: 0, margin: "0 2px" }} />

        <FeedOverrideControl feedOverride={feedOverride} onFeedOverrideChange={onFeedOverrideChange} />

        <ThemeToggle uiTheme={uiTheme} onUiThemeChange={onUiThemeChange} />

        <SettingsButton onOpenSettings={onOpenSettings} />
      </div>

      {showCustomControls ? (
        <HeaderWindowControls windowControls={windowControls} />
      ) : null}
    </header>
    </>
  );
}
