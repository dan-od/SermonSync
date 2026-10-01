/**
 * SS-036: operator-side half of the projector output bridge. Call once, in App.
 *
 * Pushes a render snapshot to the projector window whenever anything it shows
 * changes, answers its "ready" handshake, notices when it closes, keeps the
 * window on the right display, and restores output after a restart.
 */
import { useEffect } from "react";

import {
  emitProjectorState,
  isProjectorWindow,
  isTauriRuntime,
  onProjectorClosed,
  onProjectorReady,
  type ProjectorSnapshot,
} from "./projectorOutput";
import { useProjectorOutputStore } from "../stores/projectorOutputStore";
import { useProjectorStore } from "../stores/projectorStore";
import { flushTemplateSaves, useTemplateStore } from "../stores/templateStore";

const RECONCILE_INTERVAL_MS = 3000;
/** Template edits are saved fire-and-forget; let a burst of edits settle first. */
const TEMPLATE_SETTLE_MS = 700;

let restoredOnStartup = false;

export function useProjectorOutputBridge() {
  useEffect(() => {
    if (!isTauriRuntime() || isProjectorWindow()) return;

    let disposed = false;
    let templatesRevision = 0;
    let templateTimer: ReturnType<typeof setTimeout> | null = null;
    const unlisteners: Array<() => void> = [];

    const snapshot = (): ProjectorSnapshot => {
      const projector = useProjectorStore.getState();
      return {
        liveSlide: projector.liveSlide,
        feedOverride: projector.feedOverride,
        overlayMode: projector.overlayMode,
        theme: projector.theme,
        transitions: projector.transitions,
        video: useProjectorOutputStore.getState().liveVideo,
        templatesRevision,
      };
    };

    // Emitting to a window that doesn't exist is a no-op, so no gating needed.
    const push = () => {
      if (disposed) return;
      void emitProjectorState(snapshot()).catch(() => undefined);
    };

    unlisteners.push(useProjectorStore.subscribe((state, previous) => {
      if (
        state.liveSlide !== previous.liveSlide
        || state.feedOverride !== previous.feedOverride
        || state.overlayMode !== previous.overlayMode
        || state.theme !== previous.theme
        || state.transitions !== previous.transitions
      ) {
        push();
      }
    }));

    unlisteners.push(useProjectorOutputStore.subscribe((state, previous) => {
      if (state.liveVideo !== previous.liveVideo) push();
    }));

    unlisteners.push(useTemplateStore.subscribe((state, previous) => {
      if (state.templates === previous.templates && state.defaults === previous.defaults) return;
      if (templateTimer) clearTimeout(templateTimer);
      templateTimer = setTimeout(() => {
        templateTimer = null;
        // Wait for the file to actually land before telling the projector to re-read it.
        void flushTemplateSaves().then(() => {
          templatesRevision += 1;
          push();
        });
      }, TEMPLATE_SETTLE_MS);
    }));

    const track = (pending: Promise<() => void>) => {
      void pending.then((stop) => {
        if (disposed) stop();
        else unlisteners.push(stop);
      });
    };
    track(onProjectorReady(push));
    track(onProjectorClosed(() => useProjectorOutputStore.getState().handleWindowClosed()));

    const reconcileTimer = setInterval(() => {
      void useProjectorOutputStore.getState().reconcile();
    }, RECONCILE_INTERVAL_MS);

    if (!restoredOnStartup) {
      restoredOnStartup = true;
      const output = useProjectorOutputStore.getState();
      void output.refreshDisplays().then(() => {
        if (output.outputEnabled) {
          void useProjectorOutputStore.getState().turnOn({ windowed: output.windowed });
        }
      });
    }

    return () => {
      disposed = true;
      clearInterval(reconcileTimer);
      if (templateTimer) clearTimeout(templateTimer);
      unlisteners.forEach((stop) => stop());
    };
  }, []);
}
