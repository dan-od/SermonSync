import { useEffect, useState, type MouseEvent } from "react";

import { getCurrentWindow } from "@tauri-apps/api/window";
import { USE_NATIVE_WINDOW_CONTROLS } from "../../lib/platform";

/** Desktop drag region and window controls shown above the launch surface. */
export function LaunchTitleBar() {
  const [isTauriWindow] = useState(() => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isTauriWindow) return;
    let active = true;
    const appWindow = getCurrentWindow();
    void appWindow.isMaximized().then((value) => {
      if (active) setIsMaximized(value);
    });
    const handleResize = () => {
      if (!active || typeof screen === "undefined") return;
      setIsMaximized(
        Math.abs(window.outerWidth - screen.availWidth) <= 2
        && Math.abs(window.outerHeight - screen.availHeight) <= 2,
      );
    };
    window.addEventListener("resize", handleResize);
    return () => {
      active = false;
      window.removeEventListener("resize", handleResize);
    };
  }, [isTauriWindow]);

  const dragWindow = (event: MouseEvent<HTMLElement>) => {
    if (!isTauriWindow || event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    void getCurrentWindow().startDragging();
  };

  if (USE_NATIVE_WINDOW_CONTROLS && !isTauriWindow) return null;

  const controls = [
    ["Minimize", "−", () => getCurrentWindow().minimize()],
    [isMaximized ? "Restore" : "Maximize", isMaximized ? "❐" : "□", async () => {
      await getCurrentWindow().toggleMaximize();
      setIsMaximized((value) => !value);
    }],
    ["Close", "×", () => getCurrentWindow().close()],
  ] as const;

  return (
    <header
      onMouseDown={dragWindow}
      style={{
        position: "relative",
        zIndex: 30,
        height: 34,
        flexShrink: 0,
        // Parent flex column centers its children (alignItems: center), which
        // would shrink this bar to a floating pill. Stretch to full width so
        // it reads as a native title bar across the window's top edge.
        alignSelf: "stretch",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 10px 0 14px",
        background: "var(--bg-base)",
        borderBottom: "1px solid var(--border-base)",
        color: "var(--fg-muted)",
        fontFamily: "var(--font-sans)",
        fontSize: "10px",
        userSelect: "none",
      }}
    >
      <span style={{ color: "var(--fg-base)", fontWeight: 700, letterSpacing: "0.04em" }}>SermonSync</span>
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        {isTauriWindow && controls.map(([label, glyph, onClick]) => (
          <button
            key={label}
            type="button"
            title={label}
            aria-label={label}
            onClick={() => void onClick()}
            style={{
              width: 24,
              height: 22,
              border: 0,
              background: "transparent",
              color: "var(--fg-muted)",
              cursor: "pointer",
              fontSize: label === "Minimize" ? 13 : 10,
            }}
          >
            {glyph}
          </button>
        ))}
      </div>
    </header>
  );
}
