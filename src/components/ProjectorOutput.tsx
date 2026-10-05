import { useEffect, useRef, useState } from "react";

import { postProjectorChannelMessage, subscribeProjectorChannel } from "../lib/projectorChannel";
import { useTemplateStore } from "../stores/templateStore";
import { ProjectorView } from "./ProjectorView";
import type { ProjectorOutputSnapshot } from "../types/state";

const EMPTY_SNAPSHOT: ProjectorOutputSnapshot = {
  slide: null,
  media: null,
  overlays: [],
  feedOverride: "black",
  overlayMode: "widescreen",
  theme: "cross",
  transitions: {
    scriptures: { effect: "fade", durationMs: 350, easing: "ease-in-out", crossfade: true, motionBlur: false },
    songs: { effect: "fade", durationMs: 350, easing: "ease-in-out", crossfade: true, motionBlur: false },
    layout: { effect: "fade", durationMs: 350, easing: "ease-in-out", crossfade: true, motionBlur: false },
    logo: { effect: "fade", durationMs: 350, easing: "ease-in-out", crossfade: true, motionBlur: false },
    black: { effect: "cut", durationMs: 0, easing: "linear", crossfade: false, motionBlur: false },
    clear: { effect: "fade", durationMs: 350, easing: "ease-in-out", crossfade: true, motionBlur: false },
  },
  logo: { src: null, fit: "contain" },
  playback: { playing: true, looping: true, seekTime: null, seekRevision: 0 },
};

function snapshotKey(snapshot: ProjectorOutputSnapshot) {
  const slide = snapshot.slide;
  return [
    snapshot.feedOverride,
    snapshot.media?.path ?? "",
    JSON.stringify(snapshot.overlays ?? []),
    snapshot.overlayMode,
    snapshot.theme,
    slide?.reference.book ?? "",
    slide?.reference.chapter ?? "",
    slide?.reference.verse ?? "",
    slide?.version ?? "",
    slide?.text ?? "",
    JSON.stringify(snapshot.transitions),
    snapshot.logo?.src ?? "",
    snapshot.logo?.fit ?? "",
    JSON.stringify(snapshot.playback),
  ].join("|");
}

export function ProjectorOutput() {
  const [snapshot, setSnapshot] = useState<ProjectorOutputSnapshot>(EMPTY_SNAPSHOT);
  const activeOverlay = snapshot.overlays?.at(-1);
  const snapshotKeyRef = useRef(snapshotKey(EMPTY_SNAPSHOT));
  const initializeTemplates = useTemplateStore((state) => state.initialize);
  const reloadTemplates = useTemplateStore((state) => state.reload);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeProjectorChannel((message) => {
      if (!active) return;
      if (message.type === "templates-changed") {
        void reloadTemplates();
        return;
      }
      if (message.type !== "state") return;
      const incoming = message.snapshot;
      if (incoming.revision !== undefined) postProjectorChannelMessage({ type: "ack", revision: incoming.revision });
      const nextKey = snapshotKey(incoming);
      if (nextKey === snapshotKeyRef.current) return;
      snapshotKeyRef.current = nextKey;
      setSnapshot(incoming);
    });

    // Announce readiness as soon as the channel is registered. Template
    // loading can take longer and must not delay the current LIVE state.
    postProjectorChannelMessage({ type: "ready" });
    void initializeTemplates().catch((error: unknown) => console.error("Could not load projector templates", error));

    return () => {
      active = false;
      unsubscribe();
    };
  }, [initializeTemplates, reloadTemplates]);

  return (
    <main style={{ width: "100vw", height: "100vh", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", background: "#000", contain: "layout paint", isolation: "isolate", userSelect: "none", pointerEvents: "none" }}>
      <ProjectorView
        title="PROJECTOR OUTPUT"
        slide={snapshot.slide}
        media={snapshot.media}
        overlays={activeOverlay ? [activeOverlay] : []}
        feedOverride={snapshot.feedOverride}
        overlayMode={snapshot.overlayMode}
        theme={snapshot.theme}
        isLive={snapshot.feedOverride === "live" && (snapshot.slide !== null || snapshot.media !== null || Boolean(snapshot.overlays?.length))}
        fontSizePx={48}
        chrome={false}
        transitions={snapshot.transitions}
        logo={snapshot.logo}
        playback={snapshot.playback}
      />
    </main>
  );
}
