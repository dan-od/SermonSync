import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { fadeTransition } from "../../lib/transitions";
import { CameraViewport } from "../CameraViewport";
import { ResilientVideo } from "../ResilientVideo";
import type { TemplateScene } from "../../types/templates";
import type { ProjectorSlide, TransitionSetting } from "../../types/state";
import { layerAnimationKeyFor } from "./slideUtils";
import type { LayerAnimKeys } from "./slideUtils";
import { resolveLayerText, renderTemplateLayer } from "./templateRendering";
import { OneShotTransition } from "./OneShotTransition";

export const TemplateSceneOverlay = memo(function TemplateSceneOverlay({
  scene,
  slide,
  category,
  fitToContainer = false,
  animationStyle,
  animateDynamicLayers = true,
  videoPlayback,
  cameraPaused = false,
  hideDynamicLayers = false,
  clearTransition,
  isThumbnail = false,
  onBackgroundReady,
  backgroundVisible = true,
  backgroundOnly = false,
}: {
  scene: TemplateScene;
  slide: ProjectorSlide;
  category: "scriptures" | "songs";
  fitToContainer?: boolean;
  animationStyle?: CSSProperties;
  animateDynamicLayers?: boolean;
  videoPlayback?: {
    playing: boolean;
    loop: boolean;
    onVideoElementChange: (video: HTMLVideoElement | null, removedVideo?: HTMLVideoElement) => void;
  };
  cameraPaused?: boolean;
  /** Leaves static canvas elements visible while suppressing dynamic slide layers. */
  hideDynamicLayers?: boolean;
  /** Fade timing for dynamic layers appearing/disappearing under hideDynamicLayers (the "Clear" override). */
  clearTransition?: TransitionSetting;
  sceneTransition?: TransitionSetting;
  /** When true, renders a static snapshot of the template (paused video at frame 0, no loop playback, no dynamic text scrolling). */
  isThumbnail?: boolean;
  onBackgroundReady?: () => void;
  backgroundVisible?: boolean;
  /** A preparing scene only needs its background decoded; text mounts on reveal. */
  backgroundOnly?: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const ordered = useMemo(() => [...scene.layers].sort((a, b) => a.zIndex - b.zIndex), [scene.layers]);
  const media = scene.backgroundMedia?.type === "camera" ? null : scene.backgroundMedia;
  const cameraMedia = scene.cameraMedia ?? (scene.backgroundMedia?.type === "camera" ? scene.backgroundMedia : null);

  useEffect(() => {
    if ((!media || !media.src) && !cameraMedia) onBackgroundReady?.();
  }, [cameraMedia, media, onBackgroundReady]);

  const layerAnimKeys: LayerAnimKeys = {
    bookChapter: `${slide.reference.book}-${slide.reference.chapter}`,
    verse: String(slide.reference.verse),
    version: slide.version,
    text: slide.text,
  };

  useEffect(() => {
    if (!fitToContainer) return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateViewportSize = () => {
      const bounds = viewport.getBoundingClientRect();
      setViewportSize({ width: bounds.width, height: bounds.height });
    };

    updateViewportSize();
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [fitToContainer]);

  const sceneStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    position: "relative",
    overflow: "hidden",
    background: scene.backgroundStart
      ? `${scene.gradientStyle === "radial" ? "radial-gradient" : scene.gradientStyle === "conic" ? "conic-gradient" : "linear-gradient"}(${scene.gradientStyle === "linear" || !scene.gradientStyle ? `${scene.gradientAngle ?? 155}deg, ` : ""}${scene.backgroundStart}, ${scene.backgroundEnd || scene.backgroundStart})`
      : "transparent",
  };

  const sceneContent = (
    <div style={sceneStyle}>
      {media && typeof media.src === "string" && media.src.length > 0 ? (
        <div
          style={{
            position: "absolute",
            left: `${media.x}%`,
            top: `${media.y}%`,
            width: `${media.width}%`,
            height: `${media.height}%`,
            opacity: media.opacity,
            zIndex: 0,
            overflow: "hidden",
          }}
        >
          {media.type === "video" ? (
            isThumbnail ? (
              media.poster ? (
                <img
                  src={media.poster}
                  alt=""
                  loading="lazy"
                  onError={(event) => { event.currentTarget.style.display = "none"; }}
                  style={{ width: "100%", height: "100%", objectFit: media.fit, opacity: media.opacity, mixBlendMode: media.blendMode as CSSProperties["mixBlendMode"], transform: `scale(${media.flipX ? -1 : 1}, ${media.flipY ? -1 : 1})`, filter: `hue-rotate(${media.hueRotate ?? 0}deg) invert(${media.invert ?? 0}%) blur(${media.blur ?? 0}px) grayscale(${media.grayscale ?? 0}%) sepia(${media.sepia ?? 0}%) brightness(${media.brightness ?? 100}%) contrast(${media.contrast ?? 100}%) saturate(${media.saturate ?? 100}%)`, clipPath: `inset(${media.cropTop ?? 0}% ${media.cropRight ?? 0}% ${media.cropBottom ?? 0}% ${media.cropLeft ?? 0}%)` }}
                />
              ) : null
            ) : (
              <ResilientVideo
                key={media.src}
                media={media}
                style={{ width: "100%", height: "100%", objectFit: media.fit, opacity: media.opacity, mixBlendMode: media.blendMode as CSSProperties["mixBlendMode"], transform: `scale(${media.flipX ? -1 : 1}, ${media.flipY ? -1 : 1})`, filter: `hue-rotate(${media.hueRotate ?? 0}deg) invert(${media.invert ?? 0}%) blur(${media.blur ?? 0}px) grayscale(${media.grayscale ?? 0}%) sepia(${media.sepia ?? 0}%) brightness(${media.brightness ?? 100}%) contrast(${media.contrast ?? 100}%) saturate(${media.saturate ?? 100}%)`, clipPath: `inset(${media.cropTop ?? 0}% ${media.cropRight ?? 0}% ${media.cropBottom ?? 0}% ${media.cropLeft ?? 0}%)` }}
                autoPlay={videoPlayback?.playing ?? true}
                playing={isThumbnail ? false : videoPlayback?.playing}
                loop={isThumbnail ? false : videoPlayback?.loop}
                onVideoElementChange={videoPlayback?.onVideoElementChange}
                onReady={onBackgroundReady}
                onFailure={onBackgroundReady}
                presentationVisible={backgroundVisible}
                preload="auto"
              />
            )
          ) : (
            <img src={media.src} alt="" loading={isThumbnail ? "lazy" : "eager"} onLoad={onBackgroundReady} onError={(event) => { event.currentTarget.style.display = "none"; onBackgroundReady?.(); }} style={{ width: "100%", height: "100%", objectFit: media.fit, opacity: media.opacity, mixBlendMode: media.blendMode as CSSProperties["mixBlendMode"], transform: `scale(${media.flipX ? -1 : 1}, ${media.flipY ? -1 : 1})`, filter: `hue-rotate(${media.hueRotate ?? 0}deg) invert(${media.invert ?? 0}%) blur(${media.blur ?? 0}px) grayscale(${media.grayscale ?? 0}%) sepia(${media.sepia ?? 0}%) brightness(${media.brightness ?? 100}%) contrast(${media.contrast ?? 100}%) saturate(${media.saturate ?? 100}%)`, clipPath: `inset(${media.cropTop ?? 0}% ${media.cropRight ?? 0}% ${media.cropBottom ?? 0}% ${media.cropLeft ?? 0}%)` }} />
          )}
        </div>
      ) : null}
      {cameraMedia?.type === "camera" ? (
        <div
          style={{
            position: "absolute",
            left: `${cameraMedia.x}%`,
            top: `${cameraMedia.y}%`,
            width: `${cameraMedia.width}%`,
            height: `${cameraMedia.height}%`,
            opacity: cameraMedia.opacity,
            zIndex: 0,
            overflow: "hidden",
          }}
        >
          <CameraViewport media={cameraMedia} thumbnail={isThumbnail} paused={cameraPaused} onReady={onBackgroundReady} onError={onBackgroundReady ? () => onBackgroundReady() : undefined} />
        </div>
      ) : null}

      <div style={{ width: "100%", height: "100%" }}>
        {!backgroundOnly && ordered.map((layer) => {
          if (!layer.visible) {
            return null;
          }
          const dynamicTokens = layer.type === "text" ? layer.content.match(/\{(?:scripture_|song_)[^}]+\}/g) ?? [] : [];
          const isDynamicLayer = dynamicTokens.length > 0;
          const clearHidden = hideDynamicLayers && isDynamicLayer;
          const resolved = layer.type === "text" ? resolveLayerText(layer.content, slide, category, layer.scriptStyles, layer.textBackgroundStyles) : "";
          // A song title is song-scoped, not slide-scoped. Keep it dynamic so
          // clear can remove it, but do not restart its animation on every
          // active-slide change. Mixed layers still animate when they contain
          // another token such as {song_slide} or {scripture_text}.
          const isSlideDynamicLayer = dynamicTokens.some((token) => token !== "{song_title}");
          const isDynamicText = animateDynamicLayers && !isThumbnail && isSlideDynamicLayer;
          const layerAnimationKey = isDynamicText ? layerAnimationKeyFor(dynamicTokens, layerAnimKeys) : undefined;
          const layerContent = isDynamicText ? (
            <OneShotTransition key={layerAnimationKey} style={{ width: "100%", height: "100%" }} animationStyle={animationStyle}>
              {renderTemplateLayer(layer, resolved, isThumbnail)}
            </OneShotTransition>
          ) : renderTemplateLayer(layer, resolved, isThumbnail);
          return (
            <div
              key={layer.id}
              style={{
                position: "absolute",
                left: `${layer.x}%`,
                top: `${layer.y}%`,
                width: `${layer.width}%`,
                height: `${layer.height}%`,
                opacity: layer.opacity,
                transform: `rotate(${layer.rotation}deg)`,
                transformOrigin: "center",
                zIndex: layer.zIndex,
              }}
            >
              {isDynamicLayer ? (
                // Kept mounted and cross-faded (rather than unmounted) so the "Clear" override transitions in and out smoothly.
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    opacity: clearHidden ? 0 : 1,
                    transition: fadeTransition(clearTransition),
                  }}
                >
                  {layerContent}
                </div>
              ) : layerContent}
            </div>
          );
        })}
      </div>
    </div>
  );

  if (!fitToContainer) {
    return sceneContent;
  }

  const scale = viewportSize.width > 0 && viewportSize.height > 0
    ? Math.min(viewportSize.width / scene.canvasWidth, viewportSize.height / scene.canvasHeight)
    : 0;

  return (
    <div
      ref={viewportRef}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: `${scene.canvasWidth}px`,
          height: `${scene.canvasHeight}px`,
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        {sceneContent}
      </div>
    </div>
  );
});
