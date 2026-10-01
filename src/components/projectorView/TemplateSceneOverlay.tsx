import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import type { TemplateLayer, TemplateScene } from "../../types/templates";
import type { ProjectorSlide } from "../../types/state";
import { ResilientVideo } from "../ResilientVideo";
import { AutoFitTemplateText } from "./AutoFitTemplateText";
import { layerAnimationKeyFor, resolveLayerText, textLayerStyle, type LayerAnimKeys } from "./templateText";

function renderTemplateLayer(layer: TemplateLayer, text: string, isThumbnail = false) {
  if (layer.type === "shape") {
    const hasOutline = layer.borderWidth > 0 && Boolean(layer.borderColor);
    const blendMode = layer.blendMode === "source-over" || !layer.blendMode ? "normal" : layer.blendMode as CSSProperties["mixBlendMode"];
    const shadow = layer.shadow;
    const sharedStyle: CSSProperties = {
      width: "100%",
      height: "100%",
      opacity: layer.fillOpacity ?? 1,
      mixBlendMode: blendMode,
      transform: `scale(${layer.flipX ? -1 : 1}, ${layer.flipY ? -1 : 1})`,
      boxShadow: shadow ? `${shadow.offsetX}px ${shadow.offsetY}px ${shadow.blur}px ${shadow.color}` : "none",
      filter: `hue-rotate(${layer.hueRotate ?? 0}deg) invert(${layer.invert ?? 0}%) blur(${layer.blur ?? 0}px) grayscale(${layer.grayscale ?? 0}%) sepia(${layer.sepia ?? 0}%) brightness(${layer.brightness ?? 100}%) contrast(${layer.contrast ?? 100}%) saturate(${layer.saturate ?? 100}%)`,
    };
    const strokeDasharray = layer.borderDash === "dashed" ? "12 8" : layer.borderDash === "dotted" ? "1 6" : undefined;
    const polygonPoints = (count: number, innerRadius = 48) => Array.from({ length: count }, (_, index) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
      const radius = index % 2 === 0 ? 48 : innerRadius;
      return `${50 + Math.cos(angle) * radius},${50 + Math.sin(angle) * radius}`;
    }).join(" ");
    const polygonClipPoints = (count: number, innerRadius = 48) => Array.from({ length: count }, (_, index) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
      const radius = index % 2 === 0 ? 48 : innerRadius;
      return `${50 + Math.cos(angle) * radius}% ${50 + Math.sin(angle) * radius}%`;
    }).join(", ");

    const mediaClipPath = layer.shapeKind === "triangle"
      ? "polygon(50% 2%, 98% 98%, 2% 98%)"
      : layer.shapeKind === "arrow"
        ? "polygon(2% 35%, 70% 35%, 70% 2%, 98% 50%, 70% 98%, 70% 65%, 2% 65%)"
        : layer.shapeKind === "polygon"
          ? `polygon(${polygonClipPoints(Math.max(3, Math.min(12, layer.polygonSides ?? 6)), 48)})`
          : layer.shapeKind === "star"
            ? `polygon(${polygonClipPoints(Math.max(6, Math.min(20, (layer.starPoints ?? 5) * 2)), Math.max(4, Math.min(46, layer.starInnerRadius ?? 22)))})`
            : undefined;
    const mediaFill = layer.fillMode === "image" && layer.fillImage ? (
      <div
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          borderRadius: layer.shapeKind === "circle" ? "50%" : `${layer.radius}px`,
          clipPath: mediaClipPath,
          pointerEvents: "none",
        }}
      >
        {layer.fillImageType === "video" ? (
          isThumbnail ? null : (
            <ResilientVideo
              media={{ type: "video", src: layer.fillImage, fit: layer.fillImageFit === "contain" ? "contain" : "cover", loop: true, x: 0, y: 0, width: 100, height: 100, opacity: layer.fillImageOpacity ?? 1, muted: true, speed: 1 }}
              autoPlay
              playing
              loop
              style={{ width: "100%", height: "100%", objectFit: layer.fillImageFit === "contain" ? "contain" : "cover", transform: `translate(${layer.fillImageX ?? 0}%, ${layer.fillImageY ?? 0}%) scale(${Math.max(0.1, (layer.fillImageScale ?? 100) / 100)})`, transformOrigin: "center", opacity: layer.fillImageOpacity ?? 1 }}
            />
          )
        ) : layer.fillImageFit === "tile" ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `url(${JSON.stringify(layer.fillImage)})`,
              backgroundRepeat: "repeat",
              backgroundSize: `${Math.max(10, layer.fillImageScale ?? 100)}% ${Math.max(10, layer.fillImageScale ?? 100)}%`,
              backgroundPosition: `calc(50% + ${layer.fillImageX ?? 0}%) calc(50% + ${layer.fillImageY ?? 0}%)`,
              opacity: layer.fillImageOpacity ?? 1,
            }}
          />
        ) : (
          <img
            src={layer.fillImage}
            alt=""
            draggable={false}
            style={{
              width: "100%",
              height: "100%",
              display: "block",
              objectFit: layer.fillImageFit === "contain" ? "contain" : "cover",
              transform: `translate(${layer.fillImageX ?? 0}%, ${layer.fillImageY ?? 0}%) scale(${Math.max(0.1, (layer.fillImageScale ?? 100) / 100)})`,
              transformOrigin: "center",
              opacity: layer.fillImageOpacity ?? 1,
            }}
          />
        )}
      </div>
    ) : null;

    const mediaShapeStyle: CSSProperties = {
      ...sharedStyle,
      position: "relative",
      background: layer.fillMode === "image" ? "transparent" : layer.fill || "transparent",
      border: hasOutline ? `${layer.borderWidth}px solid ${layer.borderColor}` : "none",
      borderRadius: layer.shapeKind === "circle" ? "50%" : `${layer.radius}px`,
      clipPath: mediaClipPath,
    };

    if (layer.shapeKind === "triangle" || layer.shapeKind === "line" || layer.shapeKind === "arrow" || layer.shapeKind === "polygon" || layer.shapeKind === "star") {
      if (mediaFill) {
        return <div style={mediaShapeStyle}>{mediaFill}</div>;
      }
      const points = layer.shapeKind === "triangle"
        ? "50,2 98,98 2,98"
        : layer.shapeKind === "arrow"
          ? "2,35 70,35 70,2 98,50 70,98 70,65 2,65"
          : layer.shapeKind === "polygon"
            ? polygonPoints(Math.max(3, Math.min(12, layer.polygonSides ?? 6)), 48)
            : layer.shapeKind === "star"
              ? polygonPoints(Math.max(6, Math.min(20, (layer.starPoints ?? 5) * 2)), Math.max(4, Math.min(46, layer.starInnerRadius ?? 22)))
              : "2,50 98,50";
      return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={sharedStyle}>
          {layer.shapeKind === "line" ? <polyline points={points} fill="none" stroke={layer.borderColor || layer.fill || "#ffffff"} strokeWidth={Math.max(0.5, layer.borderWidth)} strokeDasharray={strokeDasharray} strokeLinecap={layer.borderLineCap ?? "round"} strokeLinejoin={layer.borderLineJoin ?? "round"} vectorEffect="non-scaling-stroke" /> : <polygon points={points} fill={layer.fill || "transparent"} stroke={hasOutline ? layer.borderColor : "none"} strokeWidth={hasOutline ? Math.max(0.5, layer.borderWidth) : 0} strokeDasharray={strokeDasharray} strokeLinejoin={layer.borderLineJoin ?? "round"} vectorEffect="non-scaling-stroke" />}
        </svg>
      );
    }

    return (
      <div
        style={{
          ...mediaShapeStyle,
        }}
      >{mediaFill}</div>
    );
  }

  const contentStyle: CSSProperties = {
    display: "block",
    width: "100%",
    minWidth: 0,
    backgroundColor: layer.lineBackgroundColor || "transparent",
    boxDecorationBreak: "clone",
    WebkitBoxDecorationBreak: "clone",
    animation: !isThumbnail && layer.scrollDuration && layer.scrollDuration > 0 ? `templateTextScroll ${layer.scrollDuration}s linear infinite` : "none",
    ...({ "--template-scroll-gap": `${layer.scrollGap ?? 100}px` } as CSSProperties),
  };
  const content = <span style={contentStyle} dangerouslySetInnerHTML={{ __html: text }} />;
  if (layer.autoFit === "grow" || layer.autoFit === "shrink") {
    return <AutoFitTemplateText layer={layer} text={text} />;
  }
  return <div style={textLayerStyle(layer)}>{content}</div>;
}

export const TemplateSceneOverlay = memo(function TemplateSceneOverlay({
  scene,
  slide,
  category,
  fitToContainer = false,
  animationStyle,
  animateDynamicLayers = true,
  videoPlayback,
  hideDynamicLayers = false,
  isThumbnail = false,
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
    onVideoElementChange: (video: HTMLVideoElement | null) => void;
  };
  /** Leaves static canvas elements visible while suppressing dynamic slide layers. */
  hideDynamicLayers?: boolean;
  /** When true, renders a static snapshot of the template (paused video at frame 0, no loop playback, no dynamic text scrolling). */
  isThumbnail?: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const ordered = useMemo(() => [...scene.layers].sort((a, b) => a.zIndex - b.zIndex), [scene.layers]);
  const media = scene.backgroundMedia;

  const layerSignature = useMemo(() => ({
    bookChapter: `${slide.reference.book}-${slide.reference.chapter}`,
    verse: String(slide.reference.verse),
    version: slide.version,
    text: slide.text,
  }), [slide]);
  const prevLayerSignatureRef = useRef(layerSignature);
  const [layerAnimKeys, setLayerAnimKeys] = useState<LayerAnimKeys>({ bookChapter: 0, verse: 0, version: 0, text: 0 });

  useEffect(() => {
    const prev = prevLayerSignatureRef.current;
    prevLayerSignatureRef.current = layerSignature;
    if (prev === layerSignature) return;
    setLayerAnimKeys((current) => ({
      bookChapter: prev.bookChapter !== layerSignature.bookChapter ? current.bookChapter + 1 : current.bookChapter,
      verse: prev.verse !== layerSignature.verse ? current.verse + 1 : current.verse,
      version: prev.version !== layerSignature.version ? current.version + 1 : current.version,
      text: prev.text !== layerSignature.text ? current.text + 1 : current.text,
    }));
  }, [layerSignature]);

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
                media={media}
                style={{ width: "100%", height: "100%", objectFit: media.fit, opacity: media.opacity, mixBlendMode: media.blendMode as CSSProperties["mixBlendMode"], transform: `scale(${media.flipX ? -1 : 1}, ${media.flipY ? -1 : 1})`, filter: `hue-rotate(${media.hueRotate ?? 0}deg) invert(${media.invert ?? 0}%) blur(${media.blur ?? 0}px) grayscale(${media.grayscale ?? 0}%) sepia(${media.sepia ?? 0}%) brightness(${media.brightness ?? 100}%) contrast(${media.contrast ?? 100}%) saturate(${media.saturate ?? 100}%)`, clipPath: `inset(${media.cropTop ?? 0}% ${media.cropRight ?? 0}% ${media.cropBottom ?? 0}% ${media.cropLeft ?? 0}%)` }}
                autoPlay={videoPlayback?.playing ?? true}
                playing={isThumbnail ? false : videoPlayback?.playing}
                loop={isThumbnail ? false : videoPlayback?.loop}
                onVideoElementChange={videoPlayback?.onVideoElementChange}
              />
            )
          ) : (
            <img src={media.src} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: media.fit, opacity: media.opacity, mixBlendMode: media.blendMode as CSSProperties["mixBlendMode"], transform: `scale(${media.flipX ? -1 : 1}, ${media.flipY ? -1 : 1})`, filter: `hue-rotate(${media.hueRotate ?? 0}deg) invert(${media.invert ?? 0}%) blur(${media.blur ?? 0}px) grayscale(${media.grayscale ?? 0}%) sepia(${media.sepia ?? 0}%) brightness(${media.brightness ?? 100}%) contrast(${media.contrast ?? 100}%) saturate(${media.saturate ?? 100}%)`, clipPath: `inset(${media.cropTop ?? 0}% ${media.cropRight ?? 0}% ${media.cropBottom ?? 0}% ${media.cropLeft ?? 0}%)` }} />
          )}
        </div>
      ) : null}

      <div style={{ width: "100%", height: "100%" }}>
        {ordered.map((layer) => {
          if (!layer.visible) {
            return null;
          }
          const dynamicTokens = layer.type === "text" ? layer.content.match(/\{(?:scripture_|song_)[^}]+\}/g) ?? [] : [];
          const isDynamicLayer = dynamicTokens.length > 0;
          if (hideDynamicLayers && isDynamicLayer) {
            return null;
          }
          const resolved = layer.type === "text" ? resolveLayerText(layer.content, slide, category, layer.scriptStyles, layer.textBackgroundStyles) : "";
          // A song title is song-scoped, not slide-scoped. Keep it dynamic so
          // clear can remove it, but do not restart its animation on every
          // active-slide change. Mixed layers still animate when they contain
          // another token such as {song_slide} or {scripture_text}.
          const isSlideDynamicLayer = dynamicTokens.some((token) => token !== "{song_title}");
          const isDynamicText = animateDynamicLayers && !isThumbnail && isSlideDynamicLayer;
          const layerAnimationKey = isDynamicText ? layerAnimationKeyFor(dynamicTokens, layerAnimKeys) : undefined;
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
              {isDynamicText ? (
                <div key={layerAnimationKey} style={{ width: "100%", height: "100%", ...animationStyle }}>
                  {renderTemplateLayer(layer, resolved, isThumbnail)}
                </div>
              ) : renderTemplateLayer(layer, resolved, isThumbnail)}
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
