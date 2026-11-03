import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { isInstant } from "../../lib/transitions";
import type { TemplateScene } from "../../types/templates";
import type { ProjectorSlide, TransitionSetting } from "../../types/state";
import { sceneBackgroundKey } from "./slideUtils";
import { TemplateSceneOverlay } from "./TemplateSceneOverlay";

interface PreparedScene {
  scene: TemplateScene;
  slide: ProjectorSlide;
  category: "scriptures" | "songs";
  backgroundKey: string;
}

/** Keep the complete outgoing slide visible while the next canvas background gets its first frame. */
export function PreparedSceneHandoff({
  scene, slide, category, hideDynamicLayers, clearTransition, animateDynamicLayers,
  sceneTransition, onForegroundReady, retain,
  videoPlayback, cameraPaused, animationStyle,
}: {
  scene: TemplateScene | null;
  slide: ProjectorSlide | null;
  category: "scriptures" | "songs";
  hideDynamicLayers: boolean;
  clearTransition?: TransitionSetting;
  animateDynamicLayers: boolean;
  sceneTransition?: TransitionSetting;
  onForegroundReady: () => void;
  retain: boolean;
  videoPlayback: { playing: boolean; loop: boolean; onVideoElementChange: (video: HTMLVideoElement | null, removedVideo?: HTMLVideoElement) => void };
  cameraPaused: boolean;
  animationStyle?: CSSProperties;
}) {
  const target = useMemo(() => scene && slide ? { scene, slide, category, backgroundKey: sceneBackgroundKey(scene) } : null, [scene, slide, category]);
  const [displayed, setDisplayed] = useState<PreparedScene | null>(() => target?.backgroundKey === "static" ? target : null);
  const [outgoing, setOutgoing] = useState<PreparedScene | null>(null);
  const [previousTarget, setPreviousTarget] = useState(target);
  if (target !== previousTarget) {
    setPreviousTarget(target);
    // A new choice supersedes the fading scene from the previous handoff.
    // Keep at most the current player and one incoming player alive.
    if (outgoing) setOutgoing(null);
    if (target && displayed?.backgroundKey === target.backgroundKey) {
      setDisplayed(target);
    }
  }
  const shown = target && displayed?.backgroundKey === target.backgroundKey ? target : displayed;
  const pending = target && shown?.backgroundKey !== target.backgroundKey ? target : null;

  useEffect(() => {
    if (!outgoing) return;
    const timeout = window.setTimeout(() => setOutgoing(null), 180);
    return () => window.clearTimeout(timeout);
  }, [outgoing]);

  useEffect(() => {
    if (retain || (!displayed && !outgoing)) return;
    const timeout = window.setTimeout(() => {
      setDisplayed(null);
      setOutgoing(null);
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [displayed, outgoing, retain]);

  const reveal = useCallback(() => {
    if (!pending) return;
    if (shown && shown.backgroundKey !== pending.backgroundKey && !isInstant(sceneTransition)) setOutgoing(shown);
    setDisplayed(pending);
    onForegroundReady();
  }, [onForegroundReady, pending, shown, sceneTransition]);

  useEffect(() => {
    if (target && !pending) onForegroundReady();
  }, [onForegroundReady, pending, target]);

  useEffect(() => {
    if (!pending) return;
    // A camera or WebKit media load can stall without an error event. A scene
    // switch must never leave the external display on the previous layout.
    const timeout = window.setTimeout(reveal, pending.scene.cameraMedia?.type === "camera" || pending.scene.backgroundMedia?.type === "camera" ? 2500 : 6000);
    return () => window.clearTimeout(timeout);
  }, [pending, reveal]);

  if (!shown && !pending && !outgoing) return null;
  const renderScene = (entry: PreparedScene, ready?: () => void, backgroundOnly = false) => (
    <TemplateSceneOverlay
      scene={entry.scene}
      slide={entry.slide}
      category={entry.category}
      hideDynamicLayers={hideDynamicLayers}
      clearTransition={clearTransition}
      animateDynamicLayers={animateDynamicLayers}
      videoPlayback={videoPlayback}
      cameraPaused={cameraPaused}
      animationStyle={animationStyle}
      onBackgroundReady={ready}
      backgroundVisible={!backgroundOnly}
      backgroundOnly={backgroundOnly}
    />
  );

  const entries = [outgoing, shown, pending].filter((entry, index, all): entry is PreparedScene =>
    entry !== null && all.findIndex((candidate) => candidate?.backgroundKey === entry.backgroundKey) === index,
  );

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {entries.map((entry) => {
        const isPending = entry.backgroundKey === pending?.backgroundKey;
        const isOutgoing = !isPending && entry.backgroundKey === outgoing?.backgroundKey && entry.backgroundKey !== shown?.backgroundKey;
        const isVisible = !isPending && !isOutgoing && entry.backgroundKey === shown?.backgroundKey;
        const role = isPending ? "preparing" : isOutgoing ? "outgoing" : isVisible ? "visible" : null;
        if (!role) return null;
        const layerStyle: CSSProperties = isPending
          ? { position: "absolute", inset: 0, opacity: 0.001, pointerEvents: "none" }
          : isOutgoing
          ? { position: "absolute", inset: 0, pointerEvents: "none", animation: `projFadeOut ${sceneTransition?.durationMs ?? 180}ms ease-out forwards` }
          : { position: "absolute", inset: 0 };
        return (
          <div key={entry.backgroundKey} data-projector-scene={role} style={layerStyle}>
            {renderScene(entry, isPending ? reveal : undefined, isPending)}
          </div>
        );
      })}
    </div>
  );
}
