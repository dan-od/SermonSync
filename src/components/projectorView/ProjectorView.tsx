import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { managedVideoUrl } from "../../lib/videoImport";
import { managedAudioUrl } from "../../lib/audioImport";
import { isVideoDataUrl } from "../../lib/media";
import { projectionScene } from "../../lib/projectionScene";
import { useAudioPeaks } from "../../lib/waveform";
import { audioPlaybackErrorMessage, getSharedAudioElement, pauseSharedAudioPlayback, startSharedAudioPlayback } from "../../lib/audioPlayback";
import { postProjectorChannelMessage } from "../../lib/projectorChannel";
import { fadeTransition, getTransitionSetting } from "../../lib/transitions";
import { useTemplateStore } from "../../stores/templateStore";
import { useProjectorStore } from "../../stores/projectorStore";
import { ResilientVideo } from "../ResilientVideo";
import { OverlayVisual } from "../Overlays/OverlayVisual";
import type { ActiveOverlay } from "../../types/overlays";
import type { LogoConfig, OverlayMode, ProjectorAudioProgress, ProjectorMedia, ProjectorPlaybackState, ProjectorSlide, TransitionCategory, TransitionsConfig, VerseTheme } from "../../types/state";
import { OVERLAY_WIDTH, OVERLAY_HEIGHT, VIEWPORT_SAFE_INSET, inferSlideCategory, referenceLabel } from "./slideUtils";
import { OneShotTransition } from "./OneShotTransition";
import { PreparedSceneHandoff } from "./PreparedSceneHandoff";
import { PreparedMediaHandoff } from "./PreparedMediaHandoff";

export { TemplateSceneOverlay } from "./TemplateSceneOverlay";

interface ProjectorViewProps {
  title: string;
  slide: ProjectorSlide | null;
  media?: ProjectorMedia | null;
  overlays?: ActiveOverlay[];
  feedOverride: "live" | "logo" | "black" | "clear";
  overlayMode: OverlayMode;
  theme: VerseTheme;
  isLive: boolean;
  fontSizePx: number;
  chrome?: boolean;
  transitions?: TransitionsConfig;
  logo?: LogoConfig;
  playback?: ProjectorPlaybackState;
  audioProgress?: ProjectorAudioProgress | null;
  onPlaybackChange?: (patch: Partial<Pick<ProjectorPlaybackState, "playing" | "looping">>) => void;
  onSeek?: (time: number) => void;
}

export function ProjectorView({ title, slide, media = null, overlays = [], feedOverride, overlayMode, isLive, fontSizePx, chrome = true, transitions: transitionsOverride, logo: logoOverride, playback, audioProgress, onPlaybackChange, onSeek }: ProjectorViewProps) {
  const activeOverlay = overlays.at(-1) ?? null;
  const stageRef = useRef<HTMLDivElement>(null);
  const backgroundVideoRef = useRef<HTMLVideoElement | null>(null);
  const logoVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackRef = useRef(playback);
  const lastAudioProgressSentRef = useRef(0);
  const liveAudioActive = useProjectorStore((state) => state.feedOverride === "live" && state.liveMedia?.category === "audio" && state.livePlayback.playing);
  useEffect(() => { playbackRef.current = playback; }, [playback]);
  const [viewportSize, setViewportSize] = useState({ width: OVERLAY_WIDTH, height: OVERLAY_HEIGHT });
  const [backgroundVideo, setBackgroundVideo] = useState<HTMLVideoElement | null>(null);
  const [isBackgroundVideoPlaying, setIsBackgroundVideoPlaying] = useState(true);
  const [isBackgroundVideoLooping, setIsBackgroundVideoLooping] = useState(true);
  const [logoVideo, setLogoVideo] = useState<HTMLVideoElement | null>(null);
  const [isLogoVideoPlaying, setIsLogoVideoPlaying] = useState(true);
  const [isLogoVideoLooping, setIsLogoVideoLooping] = useState(true);
  const [mediaVideo, setMediaVideo] = useState<HTMLVideoElement | null>(null);
  const [isMediaVideoPlaying, setIsMediaVideoPlaying] = useState(true);
  const [isMediaVideoLooping, setIsMediaVideoLooping] = useState(true);
  const [mediaAudio, setMediaAudio] = useState<HTMLAudioElement | null>(null);
  const [isMediaAudioPlaying, setIsMediaAudioPlaying] = useState(true);
  const [isMediaAudioLooping, setIsMediaAudioLooping] = useState(false);
  const [isCameraPreviewPaused, setIsCameraPreviewPaused] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const templates = useTemplateStore((s) => s.templates);
  const defaults = useTemplateStore((s) => s.defaults);
  const templatesInitialized = useTemplateStore((s) => s.initialized);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const updateScale = () => {
      const bounds = stage.getBoundingClientRect();
      const usableWidth = Math.max(0, bounds.width - VIEWPORT_SAFE_INSET * 2);
      const usableHeight = Math.max(0, bounds.height - VIEWPORT_SAFE_INSET * 2);
      const overlayRatio = OVERLAY_WIDTH / OVERLAY_HEIGHT;

      if (usableWidth <= 0 || usableHeight <= 0) {
        setViewportSize((current) => (
          current.width === OVERLAY_WIDTH && current.height === OVERLAY_HEIGHT
            ? current
            : { width: OVERLAY_WIDTH, height: OVERLAY_HEIGHT }
        ));
        return;
      }

      const stageRatio = usableWidth / usableHeight;
      const nextSize = stageRatio > overlayRatio
        ? { width: usableHeight * overlayRatio, height: usableHeight }
        : { width: usableWidth, height: usableWidth / overlayRatio };
      setViewportSize((current) => (
        current.width === nextSize.width && current.height === nextSize.height ? current : nextSize
      ));
    };

    updateScale();

    const observer = new ResizeObserver(updateScale);
    observer.observe(stage);

    return () => observer.disconnect();
  }, []);

  const canvasScale = viewportSize.width / OVERLAY_WIDTH;
  const isBlackOverride = feedOverride === "black";
  const isClearOverride = feedOverride === "clear";
  const isLogoOverride = feedOverride === "logo";
  const showSlide = feedOverride === "live";
  const mediaSource = useMemo(() => {
    if (!media) return "";
    try {
      return (media.category === "audio" ? managedAudioUrl(media.path) : managedVideoUrl(media.path)) ?? convertFileSrc(media.path);
    } catch {
      return "";
    }
  }, [media]);
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
  const storeLogo = useProjectorStore((s) => s.logo);
  const logo = logoOverride ?? storeLogo;
  const hasBackgroundVideo = activeProjectionScene?.backgroundMedia?.type === "video" && showSlide && !media && Boolean(slide);
  const hasCameraPreview = chrome && !isLive && !media && Boolean(slide) && showSlide && (activeProjectionScene?.cameraMedia?.type === "camera" || activeProjectionScene?.backgroundMedia?.type === "camera");
  const hasLogoVideo = isLogoOverride && isVideoDataUrl(logo.src);
  const hasMediaVideo = media?.category === "videos" && Boolean(mediaSource);
  const hasMediaAudio = media?.category === "audio" && Boolean(mediaSource);
  const presentationMode = media ? "media" : slide ? "scene" : "empty";
  const previousPresentationModeRef = useRef<typeof presentationMode | null>(null);
  const [outgoingPresentationMode, setOutgoingPresentationMode] = useState<"scene" | "media" | null>(null);

  useLayoutEffect(() => {
    const previousMode = previousPresentationModeRef.current;
    if (previousMode !== null && previousMode !== presentationMode) {
      setOutgoingPresentationMode(presentationMode === "empty" || previousMode === "empty" ? null : previousMode);
    }
    previousPresentationModeRef.current = presentationMode;
  }, [presentationMode]);

  const handleForegroundReady = useCallback(() => setOutgoingPresentationMode(null), []);

  useEffect(() => {
    if (presentationMode !== "scene" || !showSlide || !templatesInitialized || activeProjectionScene) return;
    const timeout = window.setTimeout(handleForegroundReady, 180);
    return () => window.clearTimeout(timeout);
  }, [activeProjectionScene, handleForegroundReady, presentationMode, showSlide, templatesInitialized]);

  const audioWaveformState = useAudioPeaks(
    chrome && hasMediaAudio && media?.audioWaveform === undefined ? mediaSource : null,
    220,
    media?.category === "audio" ? media.path : undefined,
  );
  const audioPeaks = media?.audioWaveform ?? audioWaveformState.peaks;
  const audioMinPeaks = media?.audioWaveformMin ?? audioWaveformState.minPeaks;
  const audioMaxPeaks = media?.audioWaveformMax ?? audioWaveformState.maxPeaks;
  const audioDuration = media?.audioDuration ?? audioWaveformState.duration;
  const audioError = media?.audioWaveformError ?? audioWaveformState.error;
  const audioLoading = hasMediaAudio && media?.audioWaveform === undefined
    && (!chrome || audioWaveformState.loading);
  const controlMediaName = hasMediaAudio ? "audio" : "video";

  useEffect(() => {
    if (!chrome || !isLive || !hasMediaAudio || !media || media.audioWaveform !== undefined || audioWaveformState.loading) return;
    if (audioWaveformState.peaks.length === 0 && !audioWaveformState.error) return;
    useProjectorStore.getState().setLiveAudioWaveform(
      media.path,
      audioWaveformState.peaks,
      audioWaveformState.duration,
      audioWaveformState.error,
      audioWaveformState.minPeaks,
      audioWaveformState.maxPeaks,
    );
  }, [audioWaveformState, chrome, hasMediaAudio, isLive, media]);
  // Only one of the background/logo/media videos is ever the active foreground
  // layer, so they share one progress bar and one set of controls.
  const hasVideoControl = chrome && (hasLogoVideo || hasBackgroundVideo || hasMediaVideo);
  const hasPlaybackControl = hasVideoControl || (chrome && hasMediaAudio);
  const previewAudioBlocked = hasMediaAudio && !isLive && liveAudioActive;
  const controlVideo = hasLogoVideo ? logoVideo : hasBackgroundVideo ? backgroundVideo : hasMediaAudio ? mediaAudio : hasMediaVideo ? mediaVideo : null;
  const controlVideoRef = hasLogoVideo ? logoVideoRef : hasBackgroundVideo ? backgroundVideoRef : hasMediaAudio ? mediaAudioRef : mediaVideoRef;
  const isControlVideoPlaying = hasLogoVideo ? isLogoVideoPlaying : hasBackgroundVideo ? isBackgroundVideoPlaying : hasMediaAudio ? isMediaAudioPlaying : isMediaVideoPlaying;
  const isControlVideoLooping = hasLogoVideo ? isLogoVideoLooping : hasBackgroundVideo ? isBackgroundVideoLooping : hasMediaAudio ? isMediaAudioLooping : isMediaVideoLooping;
  const setControlVideoPlaying = hasLogoVideo ? setIsLogoVideoPlaying : hasBackgroundVideo ? setIsBackgroundVideoPlaying : hasMediaAudio ? setIsMediaAudioPlaying : setIsMediaVideoPlaying;
  const setControlVideoLooping = hasLogoVideo ? setIsLogoVideoLooping : hasBackgroundVideo ? setIsBackgroundVideoLooping : hasMediaAudio ? setIsMediaAudioLooping : setIsMediaVideoLooping;
  const controlPlaying = previewAudioBlocked ? false : (playback?.playing ?? isControlVideoPlaying);
  const controlLooping = playback?.looping ?? isControlVideoLooping;

  useEffect(() => {
    if (playback?.seekTime == null) return;
    const video = controlVideoRef.current;
    if (video) {
      try { video.currentTime = playback.seekTime; } catch { /* The source may still be loading. */ }
    }
  }, [playback?.seekRevision, playback?.seekTime, controlVideoRef]);

  useEffect(() => {
    if (!chrome) return;
    const video = controlVideo;
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
  }, [controlVideo, chrome]);

  const updateBackgroundVideoElement = useCallback((video: HTMLVideoElement | null, removedVideo?: HTMLVideoElement) => {
    if (!video && removedVideo && backgroundVideoRef.current !== removedVideo) return;
    backgroundVideoRef.current = video;
    if (video && playbackRef.current?.seekTime != null) {
      try { video.currentTime = playbackRef.current.seekTime; } catch { /* The source may still be loading. */ }
    }
    if (!chrome) return;
    setBackgroundVideo(video);
    if (!video) {
      setVideoProgress(0);
      setVideoDuration(0);
      return;
    }
    setVideoProgress(Number.isFinite(video.currentTime) ? video.currentTime : 0);
    setVideoDuration(Number.isFinite(video.duration) ? video.duration : 0);
  }, [chrome]);

  const updateLogoVideoElement = useCallback((video: HTMLVideoElement | null) => {
    logoVideoRef.current = video;
    if (video && playbackRef.current?.seekTime != null) {
      try { video.currentTime = playbackRef.current.seekTime; } catch { /* The source may still be loading. */ }
    }
    if (!chrome) return;
    setLogoVideo(video);
    if (!video) {
      setVideoProgress(0);
      setVideoDuration(0);
      return;
    }
    setVideoProgress(Number.isFinite(video.currentTime) ? video.currentTime : 0);
    setVideoDuration(Number.isFinite(video.duration) ? video.duration : 0);
  }, [chrome]);

  const updateMediaVideoElement = useCallback((video: HTMLVideoElement | null, removedVideo?: HTMLVideoElement) => {
    if (!video && removedVideo && mediaVideoRef.current !== removedVideo) return;
    mediaVideoRef.current = video;
    if (video && playbackRef.current?.seekTime != null) {
      try { video.currentTime = playbackRef.current.seekTime; } catch { /* The source may still be loading. */ }
    }
    if (!chrome) return;
    setMediaVideo(video);
    if (!video) {
      setVideoProgress(0);
      setVideoDuration(0);
      return;
    }
    setVideoProgress(Number.isFinite(video.currentTime) ? video.currentTime : 0);
    setVideoDuration(Number.isFinite(video.duration) ? video.duration : 0);
  }, [chrome]);

  const updateMediaAudioElement = useCallback((audio: HTMLAudioElement | null, removedAudio?: HTMLAudioElement) => {
    if (!audio && removedAudio && mediaAudioRef.current !== removedAudio) return;
    mediaAudioRef.current = audio;
    if (audio && playbackRef.current?.seekTime != null) {
      try { audio.currentTime = playbackRef.current.seekTime; } catch { /* The source may still be loading. */ }
    }
    if (!chrome) return;
    setMediaAudio(audio);
    if (!audio) {
      setVideoProgress(0);
      setVideoDuration(0);
      return;
    }
    setVideoProgress(Number.isFinite(audio.currentTime) ? audio.currentTime : 0);
    setVideoDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
  }, [chrome]);

  const updateAudioProgress = useCallback((time: number, duration: number) => {
    if (!chrome) return;
    setVideoProgress(time);
    setVideoDuration(duration);
    if (!isLive || media?.category !== "audio") return;
    const now = Date.now();
    if (now - lastAudioProgressSentRef.current < 200) return;
    lastAudioProgressSentRef.current = now;
    postProjectorChannelMessage({ type: "audio-progress", progress: { path: media.path, time, duration } });
  }, [chrome, isLive, media]);

  const updateMediaAudioPlayback = useCallback((patch: Partial<Pick<ProjectorPlaybackState, "playing" | "looping">>) => {
    onPlaybackChange?.(patch);
    if (patch.playing !== undefined) setIsMediaAudioPlaying(patch.playing);
    if (patch.looping !== undefined) setIsMediaAudioLooping(patch.looping);
  }, [onPlaybackChange]);

  const videoPlayback = useMemo(() => ({
    playing: (presentationMode === "scene" || outgoingPresentationMode === "scene") && (playback?.playing ?? isBackgroundVideoPlaying),
    loop: playback?.looping ?? isBackgroundVideoLooping,
    onVideoElementChange: updateBackgroundVideoElement,
  }), [isBackgroundVideoLooping, isBackgroundVideoPlaying, outgoingPresentationMode, playback?.looping, playback?.playing, presentationMode, updateBackgroundVideoElement]);

  const storeTransitions = useProjectorStore((s) => s.transitions);
  const transitions = transitionsOverride ?? storeTransitions;
  const activeCategory: TransitionCategory = isBlackOverride
    ? "black"
    : isClearOverride
    ? "clear"
    : isLogoOverride
    ? "logo"
    : (templateCategory ?? "scriptures");

  const contentKey = `${slide?.reference?.book ?? ""}-${slide?.reference?.chapter ?? ""}-${slide?.reference?.verse ?? ""}-${slide?.version ?? ""}-${slide?.text ?? ""}-${overlayMode}`;

  const [transitionFrame, setTransitionFrame] = useState<{ contentKey: string; overlayMode: OverlayMode; category: TransitionCategory; key: number }>(() => ({
    contentKey, overlayMode, category: activeCategory, key: 0,
  }));
  let currentFrame = transitionFrame;
  if (transitionFrame.contentKey !== contentKey) {
    currentFrame = {
      contentKey,
      overlayMode,
      category: transitionFrame.overlayMode !== overlayMode ? "layout" : activeCategory,
      key: transitionFrame.key + 1,
    };
    // Update before commit so a new verse never briefly renders with the
    // previous transition and then starts its entrance a second time.
    setTransitionFrame(currentFrame);
  }
  const transitionCategory = currentFrame.category;

  const transitionSetting = getTransitionSetting(transitions, transitionCategory);
  const isScreenLayoutTransition = transitionCategory === "layout";

  const cssEasing = transitionSetting?.easing === "spring"
    ? "cubic-bezier(0.34, 1.56, 0.64, 1)"
    : (transitionSetting?.easing ?? "ease");

  const durationSec = (transitionSetting?.durationMs ?? 350) / 1000;
  const filterBlur = "none";

  const getAnimationName = () => {
    if (!transitionSetting || transitionSetting.effect === "cut" || transitionSetting.durationMs === 0) {
      return "none";
    }
    switch (transitionSetting.effect) {
      case "fade":
      case "slide-left":
        return "projSlideLeft";
      case "slide-right":
        return "projSlideRight";
      case "slide-up":
        return "projSlideUp";
      case "slide-down":
        return "projSlideDown";
      case "zoom-in":
        return "projZoomIn";
      case "zoom-out":
        return "projZoomOut";
      default:
        return "projFadeIn";
    }
  };

  const animName = getAnimationName();
  const animationString = animName !== "none" ? `${animName} ${durationSec}s ${cssEasing} forwards` : "none";
  const dynamicLayerAnimationStyle = useMemo<CSSProperties>(() => ({
    animation: isScreenLayoutTransition ? "none" : animationString,
    filter: isScreenLayoutTransition ? "none" : filterBlur,
    willChange: isScreenLayoutTransition ? "auto" : "transform, opacity",
    WebkitBackfaceVisibility: "hidden",
    backfaceVisibility: "hidden",
    transformStyle: "preserve-3d",
  }), [animationString, filterBlur, isScreenLayoutTransition]);

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        background: "transparent",
      }}
    >
      {chrome ? <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 4px 8px",
          marginBottom: "6px",
          borderBottom: "1px solid var(--projector-status-idle-border)",
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          color: "var(--fg-muted)",
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--projector-status-idle)" }} />
          {title}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              border: isLive ? "none" : "1px solid var(--projector-status-idle-border)",
              borderRadius: "8px",
              padding: "2px 6px",
              background: isLive ? "var(--fg-on-accent)" : "transparent",
              color: isLive ? "var(--projector-status-live)" : "var(--projector-header-status-text)",
              fontSize: "9px",
              fontWeight: 700,
            }}
          >
            {isLive ? (
              <span style={{ animation: "ssOnAirBlink 1800ms ease-in-out infinite" }}>ON-AIR</span>
            ) : (
              "IDLE"
            )}
          </span>
        </span>
      </div> : null}
      <div
        ref={stageRef}
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingLeft: chrome ? `${VIEWPORT_SAFE_INSET}px` : 0,
          paddingRight: chrome ? `${VIEWPORT_SAFE_INSET}px` : 0,
          paddingTop: chrome ? `${VIEWPORT_SAFE_INSET}px` : 0,
          paddingBottom: chrome ? `${VIEWPORT_SAFE_INSET}px` : 0,
          overflow: "hidden",
          background: chrome ? "transparent" : "#000000",
        }}
      >
        <div
          style={{
            width: `${viewportSize.width}px`,
            height: `${viewportSize.height}px`,
            position: "relative",
            borderRadius: chrome ? "var(--radius-lg)" : 0,
            background: isBlackOverride || !chrome || (!slide && !media) || (isClearOverride && Boolean(media))
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
            <OneShotTransition
              animationStyle={media || activeProjectionScene ? undefined : dynamicLayerAnimationStyle}
              style={{
                position: "relative",
                width: "100%",
                height: "100%",
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                textAlign: "left",
              }}
            >
            <div style={{ position: "absolute", inset: 0, zIndex: presentationMode === "scene" ? 3 : outgoingPresentationMode === "scene" ? 2 : 1, opacity: presentationMode === "scene" || outgoingPresentationMode === "scene" ? 1 : 0, transition: "opacity 180ms ease-out", pointerEvents: "none" }}>
              <PreparedSceneHandoff
                scene={!media ? activeProjectionScene : null}
                slide={!media ? slide : null}
                category={templateCategory ?? "scriptures"}
                hideDynamicLayers={isClearOverride}
                clearTransition={getTransitionSetting(transitions, "clear")}
                sceneTransition={transitionSetting}
                animateDynamicLayers={!isScreenLayoutTransition && (templateCategory ?? "scriptures") !== "scriptures"}
                videoPlayback={videoPlayback}
                cameraPaused={hasCameraPreview && isCameraPreviewPaused}
                animationStyle={dynamicLayerAnimationStyle}
                onForegroundReady={handleForegroundReady}
                retain={presentationMode === "scene" || outgoingPresentationMode === "scene"}
              />
            </div>
            <div style={{ position: "absolute", inset: 0, zIndex: presentationMode === "media" ? 3 : outgoingPresentationMode === "media" ? 2 : 1, opacity: presentationMode === "media" || outgoingPresentationMode === "media" ? 1 : 0, transition: "opacity 180ms ease-out", pointerEvents: "none" }}>
              <PreparedMediaHandoff
                media={media}
                source={mediaSource}
                hidden={isClearOverride}
                clearTransition={getTransitionSetting(transitions, "clear")}
                playing={presentationMode === "media" && Boolean(media) && (playback?.playing ?? (hasMediaAudio ? isMediaAudioPlaying : isMediaVideoPlaying))}
                loop={Boolean(media) && (playback?.looping ?? (hasMediaAudio ? isMediaAudioLooping : isMediaVideoLooping))}
                audioEnabled={presentationMode === "media" && Boolean(media) && chrome && showSlide && (isLive || !liveAudioActive)}
                muted={!chrome}
                audioOwner={isLive ? "live" : "preview"}
                outputProgress={audioProgress}
                audioPeaks={audioPeaks}
                audioMinPeaks={audioMinPeaks}
                audioMaxPeaks={audioMaxPeaks}
                audioDuration={audioDuration}
                audioLoading={audioLoading}
                audioError={audioError}
                onVideoElementChange={updateMediaVideoElement}
                onAudioElementChange={updateMediaAudioElement}
                onPlaybackChange={updateMediaAudioPlayback}
                onSeek={onSeek}
                onAudioProgress={updateAudioProgress}
                onForegroundReady={handleForegroundReady}
                retain={presentationMode === "media" || outgoingPresentationMode === "media"}
              />
            </div>
            {templatesInitialized && slide && showSlide && !media && !activeProjectionScene ? (
              <div data-projector-template-fallback="" style={{ position: "absolute", inset: 0, zIndex: 4, display: "grid", placeItems: "center", padding: "8%", color: "#fff", background: "#000", textAlign: "center", fontFamily: "Inter, system-ui, sans-serif" }}>
                <div><div style={{ fontSize: 54, fontWeight: 700, lineHeight: 1.2, whiteSpace: "pre-wrap" }}>{slide.text}</div><div style={{ marginTop: 28, fontSize: 27 }}>{referenceLabel(slide)}</div></div>
              </div>
            ) : null}
            </OneShotTransition>
            {activeOverlay ? (
              <div
                data-projector-overlays=""
                aria-hidden={isClearOverride}
                style={{ position: "absolute", inset: 0, opacity: isClearOverride ? 0 : 1, transition: fadeTransition(getTransitionSetting(transitions, "clear")), pointerEvents: "none" }}
              >
                <OverlayVisual key={activeOverlay.definition.id} overlay={activeOverlay.definition} startedAt={activeOverlay.startedAt} />
              </div>
            ) : null}
          </div>
          <div
            aria-label="Black live feed overlay"
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 1,
              background: "rgb(0, 0, 0)",
              opacity: isBlackOverride ? 1 : 0,
              transition: fadeTransition(getTransitionSetting(transitions, "black")),
              pointerEvents: "none",
            }}
          />
          <div
            aria-label="Logo live feed overlay"
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 1,
              background: "#000000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: isLogoOverride ? 1 : 0,
              transition: fadeTransition(getTransitionSetting(transitions, "logo")),
              pointerEvents: "none",
            }}
          >
            {logo.src ? (
              isVideoDataUrl(logo.src) ? (
                <ResilientVideo
                  media={{ type: "video", src: logo.src, fit: logo.fit === "stretch" ? "fill" : "contain", loop: true, x: 0, y: 0, width: 100, height: 100, opacity: 1, muted: true, speed: 1 }}
                  style={{ objectFit: logo.fit === "stretch" ? "fill" : "contain" }}
                  autoPlay
                  preload="auto"
                  playing={playback?.playing ?? isLogoVideoPlaying}
                  loop={playback?.looping ?? isLogoVideoLooping}
                  onVideoElementChange={updateLogoVideoElement}
                />
              ) : (
                <img
                  src={logo.src}
                  alt="Church logo"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: logo.fit === "stretch" ? "fill" : "contain",
                  }}
                />
              )
            ) : (
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
            )}
          </div>
        </div>
      </div>
      {chrome ? <div style={{ display: "flex", alignItems: "center", gap: "8px", minHeight: "28px", padding: "6px 4px 0", color: "var(--fg-muted)", fontFamily: "var(--font-mono)", fontSize: "10px" }}>
        <button
          type="button"
          onClick={() => {
            if (previewAudioBlocked) return;
            if (hasCameraPreview) setIsCameraPreviewPaused((current) => !current);
            else if (hasMediaAudio) {
              if (controlPlaying) {
                pauseSharedAudioPlayback(isLive ? "live" : "preview");
                updateMediaAudioPlayback({ playing: false });
              } else {
                const settings = media?.audioSettings;
                void startSharedAudioPlayback(mediaSource, {
                  volume: settings?.volume ?? 1,
                  trimStart: settings?.trimStart ?? 0,
                  trimEnd: settings?.trimEnd ?? null,
                  loop: controlLooping,
                }, isLive ? "live" : "preview").then((started) => {
                  if (!started) return;
                  if (isLive && media) useProjectorStore.getState().setLiveAudioPlaybackError(media.path, null);
                  updateMediaAudioPlayback({ playing: true });
                }).catch((error: unknown) => {
                  const message = audioPlaybackErrorMessage(error, getSharedAudioElement());
                  console.warn(`[ProjectorView] audio playback was blocked for ${media?.name ?? title}: ${message}`, error);
                  if (isLive && media) useProjectorStore.getState().setLiveAudioPlaybackError(media.path, message);
                  updateMediaAudioPlayback({ playing: false });
                });
              }
            }
            else if (onPlaybackChange) onPlaybackChange({ playing: !controlPlaying });
            else setControlVideoPlaying((current) => !current);
          }}
          disabled={previewAudioBlocked || (!hasPlaybackControl && !hasCameraPreview)}
          aria-label={hasCameraPreview ? `${isCameraPreviewPaused ? "Resume" : "Pause"} ${title} camera` : controlPlaying ? `Pause ${title} ${controlMediaName}` : `Play ${title} ${controlMediaName}`}
          title={previewAudioBlocked ? "Live audio has priority" : hasCameraPreview ? (isCameraPreviewPaused ? "Resume camera preview" : "Pause camera preview") : controlPlaying ? `Pause ${controlMediaName}` : `Play ${controlMediaName}`}
          style={{ width: "24px", height: "22px", border: "none", borderRadius: "var(--radius-sm)", background: "var(--bg-elevated)", color: "var(--fg-base)", cursor: !previewAudioBlocked && (hasPlaybackControl || hasCameraPreview) ? "pointer" : "not-allowed", opacity: !previewAudioBlocked && (hasPlaybackControl || hasCameraPreview) ? 1 : 0.42, fontSize: "12px", lineHeight: 1 }}
        >
          {(hasCameraPreview ? !isCameraPreviewPaused : controlPlaying) ? "Ⅱ" : "▶"}
        </button>
        {hasCameraPreview ? <span aria-label="Live camera has no seekable timeline" style={{ flex: 1, minWidth: 0, textAlign: "center", letterSpacing: "0.08em" }}>{isCameraPreviewPaused ? "CAMERA PREVIEW PAUSED" : "LIVE CAMERA"}</span> : <input
          type="range"
          min={0}
          max={videoDuration || 1}
          step="0.01"
          value={Math.min(videoProgress, videoDuration || 1)}
          disabled={previewAudioBlocked || !hasPlaybackControl || videoDuration <= 0}
          onChange={(event) => {
            if (previewAudioBlocked) return;
            const time = Number(event.target.value);
            const video = controlVideoRef.current;
            if (video && Number.isFinite(time)) video.currentTime = time;
            setVideoProgress(time);
            onSeek?.(time);
          }}
          aria-label={`${title} ${controlMediaName} progress`}
          style={{ flex: 1, minWidth: 0, accentColor: "var(--color-primary)", cursor: hasPlaybackControl && !previewAudioBlocked ? "pointer" : "not-allowed", opacity: hasPlaybackControl && !previewAudioBlocked ? 1 : 0.42 }}
        />}
        <button
          type="button"
          onClick={() => onPlaybackChange ? onPlaybackChange({ looping: !controlLooping }) : setControlVideoLooping((current) => !current)}
          disabled={previewAudioBlocked || !hasPlaybackControl || hasCameraPreview}
          aria-pressed={controlLooping}
          aria-label={`${controlLooping ? "Disable" : "Enable"} loop for ${title} ${controlMediaName}`}
          title={controlLooping ? "Loop on" : "Loop off"}
          style={{ width: "24px", height: "22px", border: "none", borderRadius: "var(--radius-sm)", background: controlLooping ? "var(--color-primary-muted)" : "var(--bg-elevated)", color: controlLooping ? "var(--color-primary)" : "var(--fg-muted)", cursor: hasPlaybackControl ? "pointer" : "not-allowed", opacity: hasPlaybackControl ? 1 : 0.42, fontSize: "15px", lineHeight: 1 }}
        >
          ↻
        </button>
      </div> : null}
    </div>
  );
}
