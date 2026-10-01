import { useEffect, useState } from "react";

import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Tauri window state + handlers for the header bar: maximize tracking,
 * drag-to-move, double-click maximize and the custom window controls.
 */
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

  return {
    isTauriWindow,
    handleHeaderMouseDown,
    handleHeaderDoubleClick,
    windowControls,
  };
}
