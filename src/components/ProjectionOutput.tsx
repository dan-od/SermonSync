import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

import { ProjectorView } from "./ProjectorView";
import { useProjectorStore } from "../stores/projectorStore";
import { useTemplateStore } from "../stores/templateStore";
import type { OverlayMode, ProjectorSlide, TransitionsConfig, VerseTheme } from "../types/state";

interface ProjectionPayload {
  liveSlide: ProjectorSlide | null;
  feedOverride: "live" | "logo" | "black" | "clear";
  overlayMode: OverlayMode;
  theme: VerseTheme;
  transitions: TransitionsConfig;
}

export function ProjectionOutput() {
  const [projection, setProjection] = useState<ProjectionPayload | null>(null);
  const initializeTemplates = useTemplateStore((state) => state.initialize);

  useEffect(() => {
    void initializeTemplates();
    let active = true;
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await listen<ProjectionPayload>("projector://state", (event) => {
        if (active) setProjection(event.payload);
      });
      const current = await invoke<ProjectionPayload | null>("get_projection_state");
      if (active && current) setProjection(current);
    })().catch((error) => console.error("Could not connect projection output", error));
    return () => { active = false; unlisten?.(); };
  }, [initializeTemplates]);

  useEffect(() => {
    if (projection) useProjectorStore.getState().setTransitions(projection.transitions);
  }, [projection]);

  return (
    <main style={{ width: "100vw", height: "100vh", margin: 0, overflow: "hidden", background: "#000" }}>
      <ProjectorView
        title="OUTPUT"
        slide={projection?.liveSlide ?? null}
        feedOverride={projection?.feedOverride ?? "black"}
        overlayMode={projection?.overlayMode ?? "widescreen"}
        theme={projection?.theme ?? "cross"}
        isLive={Boolean(projection?.liveSlide)}
        fontSizePx={48}
        bare
      />
    </main>
  );
}
