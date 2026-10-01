/**
 * SS-036: root of the congregation output window.
 *
 * Renders only the LIVE stage and mirrors whatever snapshot the operator
 * window pushes. It owns no state of its own, never talks to the sidecar, and
 * never loads App.tsx.
 */
import { useEffect, useRef, useState } from "react";

import { announceProjectorReady, onProjectorState, type ProjectorSnapshot } from "../lib/projectorOutput";
import { useProjectorStore } from "../stores/projectorStore";
import { useTemplateStore } from "../stores/templateStore";
import { ProjectorView } from "./ProjectorView";

const PROJECTION_FONT_SIZE_PX = 48;

const bodyReset = `
  html, body, #root {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: #000000;
    cursor: none;
    -webkit-user-select: none;
    user-select: none;
  }
`;

export default function ProjectorOutputWindow() {
  const [snapshot, setSnapshot] = useState<ProjectorSnapshot | null>(null);
  const templatesRevisionRef = useRef<number | null>(null);
  const initializeTemplates = useTemplateStore((s) => s.initialize);
  const reloadTemplates = useTemplateStore((s) => s.reload);

  useEffect(() => {
    void initializeTemplates();
  }, [initializeTemplates]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void onProjectorState((next) => {
      // ProjectorView reads transitions from the store, not from props.
      useProjectorStore.getState().setTransitions(next.transitions);
      const previousRevision = templatesRevisionRef.current;
      templatesRevisionRef.current = next.templatesRevision;
      if (previousRevision !== null && previousRevision !== next.templatesRevision) {
        void reloadTemplates();
      }
      setSnapshot(next);
    }).then((stop) => {
      if (disposed) {
        stop();
        return;
      }
      unlisten = stop;
      // Only announce once the listener exists, or the first snapshot is lost.
      void announceProjectorReady().catch(() => undefined);
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [reloadTemplates]);

  return (
    <>
      <style>{bodyReset}</style>
      <div style={{ position: "fixed", inset: 0, display: "flex", background: "#000000" }}>
        {snapshot ? (
          <ProjectorView
            chromeless
            title="OUTPUT"
            slide={snapshot.liveSlide}
            feedOverride={snapshot.feedOverride}
            overlayMode={snapshot.overlayMode}
            theme={snapshot.theme}
            isLive={snapshot.liveSlide !== null}
            fontSizePx={PROJECTION_FONT_SIZE_PX}
            videoControl={snapshot.video}
          />
        ) : null}
      </div>
    </>
  );
}
