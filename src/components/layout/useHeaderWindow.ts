import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function useHeaderWindow() {
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

  return { isTauriWindow, handleHeaderMouseDown, handleHeaderDoubleClick, windowControls };
}
