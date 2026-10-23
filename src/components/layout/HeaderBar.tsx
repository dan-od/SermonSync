import { useEffect, useRef, useState } from "react";

import { getCurrentWindow } from "@tauri-apps/api/window";
import { MAC_TRAFFIC_LIGHT_INSET, USE_NATIVE_WINDOW_CONTROLS, isMacOS } from "../../lib/platform";
import type { OverlayMode, SessionStatus, UiTheme } from "../../types/state";
import { useProjectorStore } from "../../stores/projectorStore";
import { useSessionStore } from "../../stores/sessionStore";
import { Dropdown } from "../Settings/primitives";

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

type HeaderMenuName = "File" | "Edit" | "View" | "Help";
type HeaderMenuEntry =
  | { kind: "separator" }
  | { kind: "action"; label: string; shortcut?: string; checked?: boolean; onSelect: () => void };

function formatElapsed(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hh = String(Math.floor(safeSeconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((safeSeconds % 3600) / 60)).padStart(2, "0");
  const ss = String(safeSeconds % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function SessionClock() {
  const elapsed = useSessionStore((state) => state.elapsed);
  return formatElapsed(elapsed);
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
  const [openMenu, setOpenMenu] = useState<HeaderMenuName | null>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);
  const [isTauriWindow] = useState(() => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window);
  const [isMaximized, setIsMaximized] = useState(false);
  const sessionInProgress = sessionStatus === "active" || sessionStatus === "paused";
  // The OS now draws the window controls (native decorations per-OS), so the
  // app hides its own. On macOS the traffic lights overlay the bar's top-left.
  const showCustomControls = isTauriWindow && !USE_NATIVE_WINDOW_CONTROLS;
  const macInset = isTauriWindow && isMacOS();

  useEffect(() => {
    if (!openMenu) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!menuBarRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openMenu]);

  useEffect(() => {
    if (!isTauriWindow) {
      return;
    }

    let active = true;
    const appWindow = getCurrentWindow();

    appWindow.isMaximized().then((value) => {
      if (active) {
        setIsMaximized(value);
      }
    }).catch(() => {
      if (active) {
        setIsMaximized(false);
      }
    });

    const handleResize = () => {
      if (!active || typeof screen === "undefined") return;
      const widthMatches = Math.abs(window.outerWidth - screen.availWidth) <= 2;
      const heightMatches = Math.abs(window.outerHeight - screen.availHeight) <= 2;
      setIsMaximized(widthMatches && heightMatches);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      active = false;
      window.removeEventListener("resize", handleResize);
    };
  }, [isTauriWindow]);

  const overrideItems: Array<{
    id: HeaderBarProps["feedOverride"];
    label: string;
    preview: string;
  }> = [
    { id: "logo", label: "Logo", preview: "◉" },
    { id: "black", label: "Black", preview: "▭" },
    { id: "clear", label: "Clear", preview: "⌾" },
  ];

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

  const headerChrome = `
    .ss-header-win {
      display: grid;
      place-items: center;
      width: 22px;
      height: 22px;
      border: none;
      background: transparent;
      color: var(--fg-muted);
      cursor: pointer;
      line-height: 1;
      transition: background-color 0.15s ease, color 0.15s ease;
    }
    .ss-header-win:hover {
      background: var(--color-primary-muted);
      color: var(--fg-base);
    }
    .ss-header-win--danger:hover {
      background: var(--color-error);
      color: var(--fg-on-accent);
    }

    .ss-header-override {
      display: flex;
      align-items: center;
      gap: 4px;
      border: none;
      background: transparent;
      color: var(--fg-muted);
      padding: 4px 8px;
      border-radius: var(--radius-full);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.02em;
      cursor: pointer;
      transition: background-color 0.15s ease, color 0.15s ease;
    }
    .ss-header-override:hover {
      color: var(--fg-base);
      background: var(--color-primary-muted);
    }
    .ss-header-override.active {
      color: var(--fg-base);
      background: var(--color-primary-muted);
    }

    .ss-header-settings {
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: var(--fg-muted);
      cursor: pointer;
      transition: background-color 0.3s ease, color 0.3s ease, transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .ss-header-settings svg {
      width: 13px;
      height: 13px;
    }
    .ss-header-settings:hover {
      background: var(--color-primary-muted);
      color: var(--fg-base);
      transform: rotate(75deg);
    }

    .ss-header-theme {
      display: flex;
      align-items: center;
      border: none;
      background: transparent;
      padding: 0;
      cursor: default;
    }
    .ss-header-theme-track {
      display: flex;
      align-items: center;
      background: var(--bg-elevated);
      border: none;
      border-radius: 4px;
      overflow: hidden;
      gap: 0;
    }
    .ss-header-theme-opt {
      border: none;
      background: transparent;
      color: var(--fg-muted);
      padding: 3px 8px;
      font-size: 9px;
      font-family: var(--font-mono);
      font-weight: 600;
      letter-spacing: 0.05em;
      cursor: pointer;
      transition: background-color 0.15s ease, color 0.15s ease;
      line-height: 1;
    }
    .ss-header-theme-opt:hover {
      color: var(--fg-base);
    }
    .ss-header-theme-opt.active {
      background: var(--color-primary-muted);
      color: var(--fg-base);
    }

    .ss-header-session {
      border: none;
      border-radius: 4px;
      background: var(--bg-elevated);
      color: var(--fg-base);
      padding: 4px 8px;
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.05em;
      cursor: pointer;
      transition: background-color 0.15s ease, color 0.15s ease;
    }
    .ss-header-session.active {
      color: var(--color-error);
    }
    .ss-header-session:hover {
      background: var(--color-primary-muted);
      color: var(--fg-base);
    }

    .ss-menubar-trigger {
      height: 24px;
      padding: 0 8px;
      border: 0;
      border-radius: 3px;
      background: transparent;
      color: var(--fg-base);
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
    }
    .ss-menubar-trigger:hover,
    .ss-menubar-trigger[aria-expanded="true"] {
      background: var(--bg-elevated);
    }
    .ss-menubar-popup {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      z-index: 2000;
      min-width: 218px;
      max-height: min(420px, calc(100vh - 48px));
      overflow: auto;
      padding: 4px;
      border: none;
      border-radius: 5px;
      background: var(--bg-surface);
      box-shadow: var(--shadow-md);
    }
    .ss-menubar-item {
      display: flex;
      align-items: center;
      gap: 16px;
      width: 100%;
      height: 25px;
      box-sizing: border-box;
      padding: 0 8px;
      border: 0;
      border-radius: 3px;
      background: transparent;
      color: var(--fg-base);
      text-align: left;
      font-size: 11px;
      cursor: pointer;
    }
    .ss-menubar-item:hover,
    .ss-menubar-item:focus-visible {
      outline: none;
      background: var(--color-primary-muted);
    }
    .ss-menubar-check {
      width: 12px;
      flex: 0 0 12px;
      color: var(--fg-muted);
      text-align: center;
    }
    .ss-menubar-shortcut {
      margin-left: auto;
      color: var(--fg-subtle);
      font-size: 10px;
    }
    .ss-menubar-separator {
      height: 1px;
      margin: 4px 4px;
      background: var(--border-base);
    }
  `;

  const handleHeaderMouseDown = async (event: React.MouseEvent<HTMLElement>) => {
    if (!isTauriWindow || event.button !== 0) {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target.closest("button, [data-no-drag='true']")) {
      return;
    }

    try {
      await getCurrentWindow().startDragging();
    } catch {
      // Ignore drag failures outside desktop runtime.
    }
  };

  const handleHeaderDoubleClick = async (event: React.MouseEvent<HTMLElement>) => {
    if (!isTauriWindow) {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target.closest("button, [data-no-drag='true']")) {
      return;
    }

    await handleToggleMaximize();
  };

  const handleMinimize = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch {
      // Ignore window API failures outside desktop runtime.
    }
  };

  const handleToggleMaximize = async () => {
    try {
      await getCurrentWindow().toggleMaximize();
      setIsMaximized((value) => !value);
    } catch {
      // Ignore window API failures outside desktop runtime.
    }
  };

  const handleClose = async () => {
    try {
      await getCurrentWindow().close();
    } catch {
      // Ignore window API failures outside desktop runtime.
    }
  };

  const windowControls = [
    { id: "minimize", label: "Minimize", glyph: "−", onClick: handleMinimize, tone: "neutral" },
    { id: "maximize", label: isMaximized ? "Restore" : "Maximize", glyph: isMaximized ? "❐" : "□", onClick: handleToggleMaximize, tone: "neutral" },
    { id: "close", label: "Close", glyph: "×", onClick: handleClose, tone: "danger" },
  ] as const;

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
        <div ref={menuBarRef} style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {(["File", "Edit", "View", "Help"] as const).map((menu) => (
            <div key={menu} style={{ position: "relative" }} onMouseEnter={() => {
              if (openMenu) setOpenMenu(menu);
            }}>
              <button
                type="button"
                className="ss-menubar-trigger"
                data-no-drag="true"
                aria-haspopup="menu"
                aria-expanded={openMenu === menu}
                onClick={() => setOpenMenu((current) => current === menu ? null : menu)}
              >
                {menu}
              </button>
              {openMenu === menu ? (
                <div className="ss-compact-menu ss-menubar-popup" role="menu" aria-label={menu}>
                  {menuEntries[menu].map((entry, index) => entry.kind === "separator" ? (
                    <div key={`${menu}-separator-${index}`} className="ss-menubar-separator" role="separator" />
                  ) : (
                    <button
                      key={`${menu}-${entry.label}`}
                      type="button"
                      role="menuitem"
                      className="ss-compact-menu-item ss-menubar-item"
                      data-no-drag="true"
                      onClick={() => {
                        setOpenMenu(null);
                        entry.onSelect();
                      }}
                    >
                      <span className="ss-menubar-check" aria-hidden="true">{entry.checked ? "✓" : ""}</span>
                      <span>{entry.label}</span>
                      {entry.shortcut ? <span className="ss-menubar-shortcut">{entry.shortcut}</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
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
        <div
          data-no-drag="true"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "0",
          }}
        >
          <span
            style={{
              color: "var(--fg-subtle)",
              fontFamily: "var(--font-mono)",
              fontSize: "8px",
              fontWeight: 700,
              letterSpacing: "0.08em",
            }}
          >
            SCREEN LAYOUT:
          </span>
          <Dropdown
            value={overlayMode}
            options={[
              { value: "widescreen", label: "Widescreen Slide" },
              { value: "lower-third", label: "Lower Third" },
              { value: "split-screen", label: "Split screen" },
            ]}
            onChange={(val) => onOverlayModeChange(val as OverlayMode)}
            containerStyle={{ width: "auto" }}
            triggerStyle={{
              background: "var(--bg-elevated)",
              border: "none",
              borderRadius: "4px",
              color: "var(--fg-base)",
              fontSize: "9px",
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
              padding: "0 8px",
              height: "25px",
              minWidth: "125px",
            }}
            optionStyle={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
            }}
          />
        </div>

        <span style={{ width: "1px", height: "14px", background: "var(--border-base)", flexShrink: 0, margin: "0 2px" }} />

        <div
          data-no-drag="true"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "0",
          }}
        >
          <span
            style={{
              color: "var(--fg-subtle)",
              fontFamily: "var(--font-mono)",
              fontSize: "8px",
              fontWeight: 700,
              letterSpacing: "0.08em",
            }}
          >
            LIVE FEED OVERRIDE:
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "1px" }}>
            {overrideItems.map((item) => {
              const active = item.id === feedOverride;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onFeedOverrideChange(active ? "live" : item.id)}
                  className={`ss-header-override${active ? " active" : ""}`}
                >
                  <span style={{ fontSize: "11px", lineHeight: 1 }}>{item.preview}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div
          data-no-drag="true"
          className="ss-header-theme"
        >
          <div className="ss-header-theme-track">
            <button
              type="button"
              className={`ss-header-theme-opt${uiTheme === "dark" ? " active" : ""}`}
              onClick={() => onUiThemeChange("dark")}
            >
              DARK
            </button>
            <button
              type="button"
              className={`ss-header-theme-opt${uiTheme === "light" ? " active" : ""}`}
              onClick={() => onUiThemeChange("light")}
            >
              LIGHT
            </button>
          </div>
        </div>

        <button
          type="button"
          title="Settings"
          aria-label="Settings"
          data-no-drag="true"
          className="ss-header-settings"
          onClick={onOpenSettings}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.02A1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.02c.27.63.87 1.05 1.55 1.07H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
        </button>
      </div>

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
