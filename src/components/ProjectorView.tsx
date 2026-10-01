import { useEffect, useMemo, useRef, useState } from "react";

import { projectionScene } from "../lib/projectionScene";
import { useTemplateStore } from "../stores/templateStore";
import { useProjectorStore } from "../stores/projectorStore";
import type { TemplateScene } from "../types/templates";
import type { ProjectorVideoControl } from "../lib/projectorOutput";
import type { OverlayMode, ProjectorSlide, TransitionCategory, VerseTheme } from "../types/state";
import { ProjectorVideoControls, ProjectorViewHeader } from "./projectorView/ProjectorViewChrome";
import { getTransitionAnimationName, projectorKeyframesCss } from "./projectorView/projectorTransitions";
import { TemplateSceneOverlay } from "./projectorView/TemplateSceneOverlay";
import { inferSlideCategory } from "./projectorView/templateText";

export { TemplateSceneOverlay };

const OVERLAY_WIDTH = 1920;
const OVERLAY_HEIGHT = 1080;
const VIEWPORT_SAFE_INSET = 2;

interface ProjectorViewProps {
  title: string;
  slide: ProjectorSlide | null;
  feedOverride: "live" | "logo" | "black" | "clear";
  overlayMode: OverlayMode;
  theme: VerseTheme;
  isLive: boolean;
  fontSizePx: number;
  /**
   * Congregation output (SS-036): no header, no video controls, no frame, no
   * padding, black letterboxing and a hidden cursor.
   */
  chromeless?: boolean;
  /** Controlled background-video playback. Uncontrolled when omitted. */
  videoControl?: ProjectorVideoControl;
  onVideoControlChange?: (control: ProjectorVideoControl) => void;
}

export function ProjectorView({ title, slide, feedOverride, overlayMode, isLive, fontSizePx, chromeless = false, videoControl, onVideoControlChange }: ProjectorViewProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const backgroundVideoRef = useRef<HTMLVideoElement | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: OVERLAY_WIDTH, height: OVERLAY_HEIGHT });
  const [backgroundVideo, setBackgroundVideo] = useState<HTMLVideoElement | null>(null);
  const [internalVideoPlaying, setInternalVideoPlaying] = useState(true);
  const [internalVideoLooping, setInternalVideoLooping] = useState(true);
  const isBackgroundVideoPlaying = videoControl?.playing ?? internalVideoPlaying;
  const isBackgroundVideoLooping = videoControl?.loop ?? internalVideoLooping;
  const toggleBackgroundVideoPlaying = () => {
    const next = { playing: !isBackgroundVideoPlaying, loop: isBackgroundVideoLooping };
    setInternalVideoPlaying(next.playing);
    onVideoControlChange?.(next);
  };
  const toggleBackgroundVideoLooping = () => {
    const next = { playing: isBackgroundVideoPlaying, loop: !isBackgroundVideoLooping };
    setInternalVideoLooping(next.loop);
    onVideoControlChange?.(next);
  };
  const safeInset = chromeless ? 0 : VIEWPORT_SAFE_INSET;
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [outgoingLayoutScene, setOutgoingLayoutScene] = useState<{ scene: TemplateScene; category: "scriptures" | "songs"; slide: ProjectorSlide; key: number } | null>(null);
  const templates = useTemplateStore((s) => s.templates);
  const defaults = useTemplateStore((s) => s.defaults);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const updateScale = () => {
      const bounds = stage.getBoundingClientRect();
      const usableWidth = Math.max(0, bounds.width - safeInset * 2);
      const usableHeight = Math.max(0, bounds.height - safeInset * 2);
      const overlayRatio = OVERLAY_WIDTH / OVERLAY_HEIGHT;

      if (usableWidth <= 0 || usableHeight <= 0) {
        setViewportSize({ width: OVERLAY_WIDTH, height: OVERLAY_HEIGHT });
        return;
      }

      const stageRatio = usableWidth / usableHeight;

      if (stageRatio > overlayRatio) {
        const nextHeight = usableHeight;
        const nextWidth = nextHeight * overlayRatio;
        setViewportSize({ width: nextWidth, height: nextHeight });
      } else {
        const nextWidth = usableWidth;
        const nextHeight = nextWidth / overlayRatio;
        setViewportSize({ width: nextWidth, height: nextHeight });
      }
    };

    updateScale();

    const observer = new ResizeObserver(updateScale);
    observer.observe(stage);

    return () => observer.disconnect();
  }, [safeInset]);

  const canvasScale = viewportSize.width / OVERLAY_WIDTH;
  const isBlackOverride = feedOverride === "black";
  const isClearOverride = feedOverride === "clear";
  const isLogoOverride = feedOverride === "logo";
  const showSlide = feedOverride === "live";
  const templateCategory = useMemo(() => (slide ? inferSlideCategory(slide) : null), [slide]);
  const activeTemplate = useMemo(() => {
    if (!templateCategory) {
      return null;
    }
    const templateId = defaults[templateCategory][overlayMode];
    if (!templateId) {
      return null;
    }
    return templates.find((entry) => entry.id === templateId && entry.category === templateCategory && entry.layout === overlayMode) ?? null;
  }, [defaults, overlayMode, templateCategory, templates]);
  const activeProjectionScene = useMemo(() => (activeTemplate ? projectionScene(activeTemplate) : null), [activeTemplate]);
  const activeProjectionSceneRef = useRef(activeProjectionScene);
  const templateCategoryRef = useRef(templateCategory);
  const slideRef = useRef(slide);
  const hasBackgroundVideo = activeProjectionScene?.backgroundMedia?.type === "video" && showSlide;

  useEffect(() => {
    const video = backgroundVideo;
    if (!video) return;
    const syncProgress = () => {
      setVideoProgress(Number.isFinite(video.currentTime) ? video.currentTime : 0);
      setVideoDuration(Number.isFinite(video.duration) ? video.duration : 0);
    };
    syncProgress();
    video.addEventListener("loadedmetadata", syncProgress);
    video.addEventListener("durationchange", syncProgress);
    video.addEventListener("timeupdate", syncProgress);
    return () => {
      video.removeEventListener("loadedmetadata", syncProgress);
      video.removeEventListener("durationchange", syncProgress);
      video.removeEventListener("timeupdate", syncProgress);
    };
  }, [backgroundVideo]);

  const updateBackgroundVideoElement = (video: HTMLVideoElement | null) => {
    backgroundVideoRef.current = video;
    setBackgroundVideo(video);
    if (!video) {
      setVideoProgress(0);
      setVideoDuration(0);
      return;
    }
    setVideoProgress(Number.isFinite(video.currentTime) ? video.currentTime : 0);
    setVideoDuration(Number.isFinite(video.duration) ? video.duration : 0);
  };

  const transitions = useProjectorStore((s) => s.transitions);
  const activeCategory: TransitionCategory = isBlackOverride
    ? "black"
    : isClearOverride
    ? "clear"
    : isLogoOverride
    ? "logo"
    : (templateCategory ?? "scriptures");

  const contentKey = `${feedOverride}-${slide?.reference?.book ?? ""}-${slide?.reference?.chapter ?? ""}-${slide?.reference?.verse ?? ""}-${slide?.text ?? ""}-${overlayMode}`;

  const [animKey, setAnimKey] = useState(0);
  const [transitionCategory, setTransitionCategory] = useState<TransitionCategory>(activeCategory);
  const prevContentKeyRef = useRef(contentKey);
  const prevOverlayModeRef = useRef(overlayMode);

  useEffect(() => {
    if (prevContentKeyRef.current !== contentKey) {
      prevContentKeyRef.current = contentKey;
      const layoutChanged = prevOverlayModeRef.current !== overlayMode;
      prevOverlayModeRef.current = overlayMode;
      setTransitionCategory(layoutChanged ? "layout" : activeCategory);
      if (layoutChanged && activeProjectionSceneRef.current && templateCategoryRef.current && slideRef.current) {
        setOutgoingLayoutScene({ scene: activeProjectionSceneRef.current, category: templateCategoryRef.current, slide: slideRef.current, key: animKey + 1 });
      } else {
        setOutgoingLayoutScene(null);
      }
      setAnimKey((k) => k + 1);
    }
    activeProjectionSceneRef.current = activeProjectionScene;
    templateCategoryRef.current = templateCategory;
    slideRef.current = slide;
  }, [activeCategory, activeProjectionScene, animKey, contentKey, overlayMode, slide, templateCategory]);

  const transitionSetting = transitions?.[transitionCategory];
  const isScreenLayoutTransition = transitionCategory === "layout";

  const cssEasing = transitionSetting?.easing === "spring"
    ? "cubic-bezier(0.34, 1.56, 0.64, 1)"
    : (transitionSetting?.easing ?? "ease");

  const durationSec = (transitionSetting?.durationMs ?? 350) / 1000;
  const filterBlur = transitionSetting?.motionBlur ? "blur(3px)" : "none";

  const animName = getTransitionAnimationName(transitionSetting);
  const animationString = animName !== "none" ? `${animName} ${durationSec}s ${cssEasing} forwards` : "none";

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        background: chromeless ? "#000000" : "transparent",
        cursor: chromeless ? "none" : undefined,
      }}
    >
      <style>{projectorKeyframesCss(transitionSetting)}</style>
      {chromeless ? null : <ProjectorViewHeader title={title} isLive={isLive} />}
      <div
        ref={stageRef}
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: `${safeInset}px`,
          overflow: "hidden",
          background: chromeless ? "#000000" : "transparent",
        }}
      >
        <div
          style={{
            width: `${viewportSize.width}px`,
            height: `${viewportSize.height}px`,
            position: "relative",
            borderRadius: chromeless ? 0 : "var(--radius-lg)",
            background: isBlackOverride || chromeless
              ? "#000000"
              : "linear-gradient(180deg, rgba(16, 20, 44, 0.95), rgba(8, 9, 18, 1))",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${OVERLAY_WIDTH}px`,
              height: `${OVERLAY_HEIGHT}px`,
              boxSizing: "border-box",
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: `translate(-50%, -50%) scale(${canvasScale})`,
              transformOrigin: "center center",
              overflow: "hidden",
            }}
          >
            <div
              key={activeProjectionScene && isScreenLayoutTransition ? animKey : activeProjectionScene ? undefined : animKey}
              style={{
                width: "100%",
                height: "100%",
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                textAlign: "left",
                animation: activeProjectionScene && !isScreenLayoutTransition ? "none" : animationString,
                filter: activeProjectionScene && !isScreenLayoutTransition ? "none" : filterBlur,
                willChange: activeProjectionScene && !isScreenLayoutTransition ? "auto" : "transform, opacity",
                WebkitBackfaceVisibility: "hidden",
                backfaceVisibility: "hidden",
                transformStyle: "preserve-3d",
              }}
            >
            {outgoingLayoutScene && isScreenLayoutTransition ? (
              <div
                key={`outgoing-layout-${outgoingLayoutScene.key}`}
                style={{ position: "absolute", inset: 0, animation: `projFadeOut ${durationSec}s ${cssEasing} forwards`, filter: filterBlur, willChange: "opacity" }}
                onAnimationEnd={() => setOutgoingLayoutScene(null)}
              >
                <TemplateSceneOverlay scene={outgoingLayoutScene.scene} slide={outgoingLayoutScene.slide} category={outgoingLayoutScene.category} animateDynamicLayers={false} />
              </div>
            ) : null}
            {activeProjectionScene && ((showSlide && slide) || (isClearOverride && slide)) ? (
              <TemplateSceneOverlay
                scene={activeProjectionScene}
                slide={slide}
                category={templateCategory ?? "scriptures"}
                hideDynamicLayers={isClearOverride}
                animateDynamicLayers={!isScreenLayoutTransition}
                videoPlayback={{ playing: isBackgroundVideoPlaying, loop: isBackgroundVideoLooping, onVideoElementChange: updateBackgroundVideoElement }}
                animationStyle={{
                  animation: isScreenLayoutTransition ? "none" : animationString,
                  filter: isScreenLayoutTransition ? "none" : filterBlur,
                  willChange: isScreenLayoutTransition ? "auto" : "transform, opacity",
                  WebkitBackfaceVisibility: "hidden",
                  backfaceVisibility: "hidden",
                  transformStyle: "preserve-3d",
                }}
              />
            ) : isLogoOverride ? (
              <div
                style={{
                  color: "#e7eeff",
                  fontFamily: "var(--font-mono)",
                  fontSize: `${Math.max(40, Math.round(fontSizePx * 1.6))}px`,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                LOGO OVERLAY
              </div>
            ) : null}
            </div>
          </div>
          {isBlackOverride && (
            <div
              aria-label="Black live feed overlay"
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 1,
                background: "rgb(0, 0, 0)",
              }}
            />
          )}
        </div>
      </div>
      {chromeless ? null : (
        <ProjectorVideoControls
          title={title}
          hasBackgroundVideo={hasBackgroundVideo}
          isBackgroundVideoPlaying={isBackgroundVideoPlaying}
          isBackgroundVideoLooping={isBackgroundVideoLooping}
          videoProgress={videoProgress}
          videoDuration={videoDuration}
          onTogglePlaying={toggleBackgroundVideoPlaying}
          onToggleLooping={toggleBackgroundVideoLooping}
          onSeek={(time) => {
            const video = backgroundVideoRef.current;
            if (video && Number.isFinite(time)) video.currentTime = time;
            setVideoProgress(time);
          }}
        />
      )}
    </div>
  );
}
