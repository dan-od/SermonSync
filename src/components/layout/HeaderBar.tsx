import { useEffect, useState } from "react";

import { getCurrentWindow } from "@tauri-apps/api/window";
import type { SessionStatus, UiTheme } from "../../types/state";

export interface HeaderBarProps {
  activeTab: "suggestions" | "bible" | "notes" | "database";
  onTabChange: (tab: "suggestions" | "bible" | "notes" | "database") => void;
  feedOverride: "live" | "logo" | "black" | "clear";
  onFeedOverrideChange: (mode: "live" | "logo" | "black" | "clear") => void;
  uiTheme: UiTheme;
  onUiThemeChange: (theme: UiTheme) => void;
  sessionStatus: SessionStatus;
  onSessionStart: () => void;
  onSessionEnd: () => void;
}

export function HeaderBar({
  activeTab,
  onTabChange,
  feedOverride,
  onFeedOverrideChange,
  uiTheme,
  onUiThemeChange,
  sessionStatus,
  onSessionStart,
  onSessionEnd,
}: HeaderBarProps) {
  const [isTauriWindow] = useState(() => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window);
  const [isMaximized, setIsMaximized] = useState(false);

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

    const unlistenPromise = appWindow.onResized(async () => {
      try {
        const value = await appWindow.isMaximized();
        if (active) {
          setIsMaximized(value);
        }
      } catch {
        if (active) {
          setIsMaximized(false);
        }
      }
    });

    return () => {
      active = false;
      unlistenPromise.then((unlisten) => unlisten()).catch(() => undefined);
    };
  }, [isTauriWindow]);

  const navItems: Array<{
    id: HeaderBarProps["activeTab"];
    label: string;
    glyph: string;
  }> = [
    { id: "suggestions", label: "Suggestions", glyph: "⌘" },
    { id: "bible", label: "Bible", glyph: "◫" },
    { id: "notes", label: "Notes", glyph: "✦" },
    { id: "database", label: "Database", glyph: "◌" },
  ];

  const overrideItems: Array<{
    id: HeaderBarProps["feedOverride"];
    label: string;
    preview: string;
  }> = [
    { id: "logo", label: "Logo", preview: "◉" },
    { id: "black", label: "Black", preview: "▭" },
    { id: "clear", label: "Clear", preview: "⌾" },
  ];

  const controlShellStyle = {
    display: "flex",
    alignItems: "center",
    borderRadius: "var(--radius-full)",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-base)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
  } as const;

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
      background: rgba(255, 255, 255, 0.06);
      color: var(--fg-base);
    }
    .ss-header-win--danger:hover {
      background: #e0475a;
      color: #ffffff;
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
      background: rgba(255, 255, 255, 0.05);
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
      border: 1px solid var(--border-base);
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
      color: #ffd7de;
    }
    .ss-header-session:hover {
      background: var(--color-primary-muted);
      color: var(--fg-base);
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
      const value = await getCurrentWindow().isMaximized();
      setIsMaximized(value);
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
        gridTemplateColumns: isTauriWindow ? "1fr auto 1fr auto" : "1fr auto 1fr",
        alignItems: "center",
        gap: "12px",
        padding: "0 12px 0 12px",
        height: "34px",
        background: "var(--bg-base)",
        borderBottom: "1px solid var(--border-base)",
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
      </div>

      <div
        style={{
          ...controlShellStyle,
          justifySelf: "center",
          gap: "2px",
          padding: "2px",
        }}
      >
        {navItems.map((item) => {
          const active = item.id === activeTab;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              title={item.label}
              style={{
                width: "22px",
                height: "22px",
                borderRadius: "7px",
                border: "none",
                background: active ? "var(--color-primary-muted)" : "transparent",
                color: active ? "var(--fg-base)" : "#aeb7d0",
                fontSize: "10px",
                lineHeight: 1,
                boxShadow: active ? "inset 0 0 0 1px rgba(123, 47, 247, 0.2)" : "none",
                cursor: "pointer",
              }}
            >
              {item.glyph}
            </button>
          );
        })}
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: "6px",
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
              color: "#7f8eb0",
              fontFamily: "var(--font-mono)",
              fontSize: "8px",
              fontWeight: 700,
              letterSpacing: "0.08em",
            }}
          >
            FEED OVERRIDE:
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
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.02A1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.02c.27.63.87 1.05 1.55 1.07H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
        </button>
      </div>

      {isTauriWindow ? (
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
