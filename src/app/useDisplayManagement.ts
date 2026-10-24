import { useEffect, useRef } from "react";
import { discoverDisplays, hideProjectorOutput, openProjectorOutput } from "../lib/projectorOutput";
import { EMPTY_DISPLAY_STABILITY, observeConnectedDisplay } from "../lib/displayStability";
import { useProjectorStore } from "../stores";

export function useDisplayManagement(outputStatus: ReturnType<typeof useProjectorStore.getState>["outputStatus"]) {
  const displayStabilityRef = useRef(EMPTY_DISPLAY_STABILITY);

  useEffect(() => {
    if (outputStatus === "ready" || outputStatus === "closed" || outputStatus === "error") {
      displayStabilityRef.current = EMPTY_DISPLAY_STABILITY;
    }
    let disposed = false;
    let refreshing = false;

    const refreshDisplays = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const displays = await discoverDisplays();
        if (disposed) return;

        const store = useProjectorStore.getState();
        store.setAvailableDisplays(displays);
        const selected = displays.find((display) => display.id === store.selectedDisplayId);
        const fallback = displays.find((display) => display.isPrimary) ?? displays[0] ?? null;

        if (!store.selectedDisplayId && fallback) {
          let persistedId: string | null = null;
          try {
            const persisted = window.localStorage.getItem("sermonsync-settings-panel");
            persistedId = persisted ? (JSON.parse(persisted) as { outputDisplayId?: string }).outputDisplayId ?? null : null;
          } catch {
            persistedId = null;
          }
          const persistedDisplay = persistedId ? displays.find((display) => display.id === persistedId) : null;
          store.selectDisplay((persistedDisplay ?? fallback).id);
        }

        if (store.outputStatus === "connected") {
          const fingerprint = selected ? `${selected.id}:${selected.x}:${selected.y}:${selected.width}:${selected.height}:${selected.scaleFactor}` : null;
          const observation = observeConnectedDisplay(displayStabilityRef.current, fingerprint);
          displayStabilityRef.current = observation.state;
          if (observation.action === "disconnect") {
            await hideProjectorOutput();
            store.setOutputStatus("disconnected");
          } else if (observation.action === "reposition" && selected) {
            await openProjectorOutput(selected);
          }
        } else if (store.outputStatus === "disconnected" && selected) {
          const fingerprint = `${selected.id}:${selected.x}:${selected.y}:${selected.width}:${selected.height}:${selected.scaleFactor}`;
          displayStabilityRef.current = { ...EMPTY_DISPLAY_STABILITY, confirmedFingerprint: fingerprint };
          await openProjectorOutput(selected);
        }
      } catch (error) {
        console.warn("Could not refresh connected displays", error);
        if (!disposed && useProjectorStore.getState().outputStatus !== "connected") {
          useProjectorStore.getState().setOutputStatus("error");
        }
      } finally {
        refreshing = false;
      }
    };

    void refreshDisplays();

    // A display that goes to sleep and wakes back up (or a monitor topology
    // change while the app is unfocused/minimized) is otherwise only picked
    // up again by the manual "Refresh displays" button. Re-check as soon as
    // the app becomes visible/focused again so a reconnected HDMI output
    // doesn't require that manual step.
    const handleWake = () => {
      if (document.hidden) return;
      void refreshDisplays();
    };
    document.addEventListener("visibilitychange", handleWake);
    window.addEventListener("focus", handleWake);
    const removeWakeListeners = () => {
      document.removeEventListener("visibilitychange", handleWake);
      window.removeEventListener("focus", handleWake);
    };

    if (outputStatus === "closed") {
      return () => {
        disposed = true;
        removeWakeListeners();
      };
    }
    const timer = window.setInterval(() => void refreshDisplays(), 5000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      removeWakeListeners();
    };
  }, [outputStatus]);
}
