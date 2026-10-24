import { useEffect } from "react";
import { publishProjectorSnapshot, startProjectorOutputBridge } from "../lib/projectorOutput";
import { useProjectorStore } from "../stores";

export function useProjectorOutputBridge() {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void startProjectorOutputBridge().then((cleanup) => {
      if (disposed) cleanup();
      else unlisten = cleanup;
    });

    const unsubscribe = useProjectorStore.subscribe((state, previous) => {
      if (
        state.liveSlide !== previous.liveSlide
        || state.liveMedia !== previous.liveMedia
        || state.activeOverlays !== previous.activeOverlays
        || state.feedOverride !== previous.feedOverride
        || state.overlayMode !== previous.overlayMode
        || state.theme !== previous.theme
        || state.transitions !== previous.transitions
        || state.livePlayback !== previous.livePlayback
      ) {
        void publishProjectorSnapshot();
      }
    });

    // Publish the current state once on startup as well. This covers an output
    // window that reconnects while the state itself has not changed.
    void publishProjectorSnapshot();

    return () => {
      disposed = true;
      unlisten?.();
      unsubscribe();
    };
  }, []);
}
