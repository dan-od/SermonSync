import type { OverlayMode, UiTheme } from "../../types/state";
import { Dropdown } from "../Settings/primitives";
import type { HeaderBarProps } from "./HeaderBar";

export function HeaderActions({
  overlayMode,
  onOverlayModeChange,
  feedOverride,
  onFeedOverrideChange,
  uiTheme,
  onUiThemeChange,
  onOpenSettings,
}: {
  overlayMode: OverlayMode;
  onOverlayModeChange: (mode: OverlayMode) => void;
  feedOverride: HeaderBarProps["feedOverride"];
  onFeedOverrideChange: HeaderBarProps["onFeedOverrideChange"];
  uiTheme: UiTheme;
  onUiThemeChange: (theme: UiTheme) => void;
  onOpenSettings: () => void;
}) {
  const overrideItems: Array<{
    id: HeaderBarProps["feedOverride"];
    label: string;
    preview: string;
  }> = [
    { id: "logo", label: "Logo", preview: "◉" },
    { id: "black", label: "Black", preview: "▭" },
    { id: "clear", label: "Clear", preview: "⌾" },
  ];

  return (
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
            padding: "2px 6px",
            height: "22px",
            minWidth: "125px",
          }}
          optionStyle={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            padding: "5px 8px",
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
  );
}
