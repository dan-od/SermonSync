import { MAC_TRAFFIC_LIGHT_INSET, USE_NATIVE_WINDOW_CONTROLS, isMacOS } from "../../lib/platform";
import type { OverlayMode, SessionStatus, UiTheme } from "../../types/state";
import { HeaderActions } from "./HeaderActions";
import { headerChrome } from "./headerBarChrome";
import { HeaderSessionCluster } from "./HeaderSessionCluster";
import { useHeaderWindow } from "./useHeaderWindow";

export interface HeaderBarProps {
  activeTab: "suggestions" | "bible" | "notes" | "database" | "summary";
  onTabChange: (tab: "suggestions" | "bible" | "notes" | "database" | "summary") => void;
  overlayMode: OverlayMode;
  onOverlayModeChange: (mode: OverlayMode) => void;
  feedOverride: "live" | "logo" | "black" | "clear";
  onFeedOverrideChange: (mode: "live" | "logo" | "black" | "clear") => void;
  uiTheme: UiTheme;
  onUiThemeChange: (theme: UiTheme) => void;
  sessionStatus: SessionStatus;
  sessionElapsedSeconds: number;
  onSessionStart: () => void;
  onSessionEnd: () => void;
  onOpenSummary: () => void;
  onOpenSettings: () => void;
}

export function HeaderBar({
  overlayMode,
  onOverlayModeChange,
  feedOverride,
  onFeedOverrideChange,
  uiTheme,
  onUiThemeChange,
  sessionStatus,
  sessionElapsedSeconds,
  onSessionStart,
  onSessionEnd,
  onOpenSummary,
  onOpenSettings,
}: HeaderBarProps) {
  const { isTauriWindow, handleHeaderMouseDown, handleHeaderDoubleClick, windowControls } = useHeaderWindow();
  // The OS now draws the window controls (native decorations per-OS), so the
  // app hides its own. On macOS the traffic lights overlay the bar's top-left.
  const showCustomControls = isTauriWindow && !USE_NATIVE_WINDOW_CONTROLS;
  const macInset = isTauriWindow && isMacOS();

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
      <HeaderSessionCluster
        sessionStatus={sessionStatus}
        sessionElapsedSeconds={sessionElapsedSeconds}
        onSessionStart={onSessionStart}
        onSessionEnd={onSessionEnd}
        onOpenSummary={onOpenSummary}
      />

      <HeaderActions
        overlayMode={overlayMode}
        onOverlayModeChange={onOverlayModeChange}
        feedOverride={feedOverride}
        onFeedOverrideChange={onFeedOverrideChange}
        uiTheme={uiTheme}
        onUiThemeChange={onUiThemeChange}
        onOpenSettings={onOpenSettings}
      />

      {showCustomControls ? (
        <div
          data-no-drag="true"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "2px",
            justifySelf: "end",
          }}
        >
          {windowControls.map((control) => (
            <button
              key={control.id}
              type="button"
              onClick={control.onClick}
              title={control.label}
              data-no-drag="true"
              className={`ss-header-win${control.tone === "danger" ? " ss-header-win--danger" : ""}`}
              style={{
                fontSize: control.id === "minimize" ? "12px" : "9px",
              }}
            >
              {control.glyph}
            </button>
          ))}
        </div>
      ) : null}
    </header>
    </>
  );
}
