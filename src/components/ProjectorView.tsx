import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { managedVideoUrl } from "../lib/videoImport";
import { managedAudioUrl } from "../lib/audioImport";

import { resolveRichTextTokens } from "../lib/richText";
import { isVideoDataUrl } from "../lib/media";
import { projectionScene } from "../lib/projectionScene";
import { useAudioPeaks } from "../lib/waveform";
import { audioPlaybackErrorMessage, getSharedAudioElement, getSharedAudioOwner, pauseSharedAudioPlayback, startSharedAudioPlayback } from "../lib/audioPlayback";
import { postProjectorChannelMessage } from "../lib/projectorChannel";
import { fadeTransition, getTransitionSetting, isInstant } from "../lib/transitions";
import { useTemplateStore } from "../stores/templateStore";
import { useProjectorStore } from "../stores/projectorStore";
import { CameraViewport } from "./CameraViewport";
import { ResilientImage } from "./ResilientImage";
import { ResilientVideo } from "./ResilientVideo";
import { WaveformCanvas } from "./Media/Waveform";
import { LiveWaveform } from "./Media/LiveWaveform";
import { OverlayVisual } from "./Overlays/OverlayVisual";
import type { ActiveOverlay } from "../types/overlays";
import type { TemplateLayer, TemplateScene, TemplateTextScript } from "../types/templates";
import type { LogoConfig, OverlayMode, ProjectorAudioProgress, ProjectorMedia, ProjectorPlaybackState, ProjectorSlide, TransitionCategory, TransitionSetting, TransitionsConfig, VerseTheme } from "../types/state";

const OVERLAY_WIDTH = 1920;
const OVERLAY_HEIGHT = 1080;
const VIEWPORT_SAFE_INSET = 2;
const autoFitSizeCache = new WeakMap<Extract<TemplateLayer, { type: "text" }>, Map<string, number>>();

function referenceLabel(slide: ProjectorSlide) {
  return `${slide.reference.book} ${slide.reference.chapter}:${slide.reference.verse}`;
}

type LayerAnimField = "bookChapter" | "verse" | "version" | "text";
type LayerAnimKeys = Record<LayerAnimField, string>;

// Maps each dynamic token to the slide field it actually depends on, so a layer only
// replays its entrance animation when that specific field changes (e.g. a verse-only
// change should not replay the book/chapter reference or the untouched version label).
const TOKEN_ANIM_FIELD: Record<string, LayerAnimField> = {
  "{scripture_reference}": "bookChapter",
  "{scripture_number}": "verse",
  "{scripture_name}": "version",
  "{scripture_version}": "version",
  "{scripture_text}": "text",
  "{song_lines}": "text",
  "{song_slide}": "text",
};

function layerAnimationKeyFor(dynamicTokens: string[], keys: LayerAnimKeys) {
  const relevantTokens = dynamicTokens.filter((token) => token !== "{song_title}");
  const fields = new Set<LayerAnimField>();
  let hasUnknownToken = false;
  relevantTokens.forEach((token) => {
    const field = TOKEN_ANIM_FIELD[token];
    if (field) {
      fields.add(field);
    } else {
      hasUnknownToken = true;
    }
  });
  const activeFields = hasUnknownToken ? (Object.keys(keys) as LayerAnimField[]) : Array.from(fields);
  return JSON.stringify(activeFields.map((field) => [field, keys[field]]));
}

/** An entrance runs once for its mounted content, even if settings or other views rerender. */
function OneShotTransition({ animationStyle, style, children }: { animationStyle?: CSSProperties; style?: CSSProperties; children: ReactNode }) {
  const [initialAnimationStyle] = useState(animationStyle);
  const [finished, setFinished] = useState(false);
  return (
    <div
      style={{ ...style, ...initialAnimationStyle, ...(finished ? { animation: "none", filter: "none", willChange: "auto" } : null) }}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) setFinished(true);
      }}
    >
      {children}
    </div>
  );
}

function removeOuterQuotes(text: string) {
  const trimmed = text.trim();
  const quotePairs: Array<[string, string]> = [["\"", "\""], ["“", "”"], ["‘", "’"]];
  for (const [opening, closing] of quotePairs) {
    if (trimmed.startsWith(opening) && trimmed.endsWith(closing)) {
      return trimmed.slice(opening.length, -closing.length).trim();
    }
  }
  return text;
}

function inferSlideCategory(slide: ProjectorSlide): "scriptures" | "songs" {
  const book = slide.reference.book.trim().toLowerCase();
  if (slide.version === "SONG" || book === "song") {
    return "songs";
  }
  return "scriptures";
}

function resolveLayerText(content: string, slide: ProjectorSlide, category: "scriptures" | "songs", scriptStyles: Record<string, TemplateTextScript> = {}, backgroundStyles: Record<string, string> = {}) {
  const scriptureReference = referenceLabel(slide);
  const replacements: Record<string, string> = {
    scripture_text: removeOuterQuotes(slide.text),
    scripture_reference: scriptureReference,
    scripture_number: String(slide.reference.verse),
    scripture_name: slide.version,
    scripture_version: slide.version,
    song_lines: category === "songs" ? removeOuterQuotes(slide.text) : "",
    song_slide: category === "songs" ? removeOuterQuotes(slide.text) : "",
    song_title: category === "songs" ? slide.reference.book : "",
  };

  return resolveRichTextTokens(content, replacements, scriptStyles, backgroundStyles);
}

function textLayerStyle(layer: Extract<TemplateLayer, { type: "text" }>, fontSize = layer.fontSize): CSSProperties {
  const shadow = layer.shadow;
  return {
    width: "100%",
    height: "100%",
    color: layer.color || "transparent",
    backgroundColor: layer.backgroundColor || "transparent",
    border: layer.boxBorderColor && (layer.boxBorderWidth ?? 0) > 0 ? `${layer.boxBorderWidth}px solid ${layer.boxBorderColor}` : "none",
    borderRadius: `${Math.max(0, layer.cornerRadius ?? 0)}px`,
    WebkitTextStrokeColor: layer.outlineColor || "transparent",
    WebkitTextStrokeWidth: layer.outlineColor && layer.outlineWidth > 0 ? `${layer.outlineWidth}px` : "0px",
    fontFamily: layer.fontFamily,
    fontStyle: layer.fontStyle,
    fontSize: `${fontSize}px`,
    letterSpacing: `${((layer.charSpacing ?? 0) / 1000) * fontSize}px`,
    fontWeight: layer.fontWeight,
    textAlign: layer.align,
    lineHeight: `${fontSize * layer.lineHeight + (layer.lineSpacing ?? 0)}px`,
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    overflow: "hidden",
    textShadow: shadow && (shadow.blur > 0 || shadow.offsetX !== 0 || shadow.offsetY !== 0)
      ? `${shadow.offsetX}px ${shadow.offsetY}px ${shadow.blur}px ${shadow.color}`
      : "none",
    display: "flex",
    alignItems: "center",
    justifyContent: layer.align === "left" ? "flex-start" : layer.align === "right" ? "flex-end" : "center",
    padding: "8px",
    boxSizing: "border-box",
  };
}

function AutoFitTemplateText({ layer, text }: { layer: Extract<TemplateLayer, { type: "text" }>; text: string }) {
  const textRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(layer.fontSize);
  const [boxSize, setBoxSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const host = textRef.current;
    if (!host) return;

    const updateBoxSize = () => {
      const nextSize = { width: host.clientWidth, height: host.clientHeight };
      setBoxSize((current) => (
        current.width === nextSize.width && current.height === nextSize.height ? current : nextSize
      ));
    };

    updateBoxSize();
    const observer = new ResizeObserver(updateBoxSize);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const host = textRef.current;
    if (!host) return;
    const contentWidth = Math.max(1, host.clientWidth - 16);
    const contentHeight = Math.max(1, host.clientHeight - 16);
    const cacheKey = `${contentWidth}:${contentHeight}:${text}`;
    const cachedSize = autoFitSizeCache.get(layer)?.get(cacheKey);
    if (cachedSize !== undefined) {
      setFontSize(cachedSize);
      return;
    }
    const probes: HTMLDivElement[] = [];

    const createProbe = (width: string) => {
      const probe = document.createElement("div");
      Object.assign(probe.style, {
        position: "absolute",
        left: "-100000px",
        top: "0",
        width,
        padding: "0",
        margin: "0",
        boxSizing: "border-box",
        visibility: "hidden",
        pointerEvents: "none",
        display: "block",
        color: "transparent",
        fontFamily: layer.fontFamily,
        fontStyle: layer.fontStyle,
        fontWeight: String(layer.fontWeight),
        lineHeight: String(layer.lineHeight),
        textAlign: layer.align,
        whiteSpace: "pre-wrap",
        overflowWrap: "break-word",
        wordBreak: "break-word",
      });
      probe.innerHTML = text;
      // Keep measurement nodes outside the React-managed subtree. React 19
      // reconciles the host's children while resize/template updates are
      // happening; imperatively inserting a sibling here can make WebKit
      // throw NotFoundError during its next commit.
      document.body.appendChild(probe);
      probes.push(probe);
      return probe;
    };

    const wrappedProbe = createProbe(`${contentWidth}px`);
    const fits = (size: number) => {
      wrappedProbe.style.fontSize = `${size}px`;
      wrappedProbe.style.lineHeight = `${size * layer.lineHeight + (layer.lineSpacing ?? 0)}px`;
      const wrappedHeight = Math.ceil(wrappedProbe.getBoundingClientRect().height);
      return wrappedHeight <= contentHeight;
    };

    let low = 6;
    // The saved font size is the design ceiling. Grow-to-fit may use that
    // size when the content is short, while longer content is reduced below
    // it. This prevents a measurement glitch from ever expanding text past
    // the template's intended typography.
    let high = Math.max(6, layer.fontSize);

    let best = high;
    // Most authored text already fits at its design size. Avoid a binary
    // search (and its forced layouts) unless this particular slide overflows.
    if (!fits(high)) {
      best = low;
      for (let iteration = 0; iteration < 10 && high - low > 0.25; iteration += 1) {
        const candidate = (low + high) / 2;
        if (fits(candidate)) {
          best = candidate;
          low = candidate;
        } else {
          high = candidate;
        }
      }
    }
    const nextFontSize = Math.max(6, Math.min(512, Math.round(best * 100) / 100));
    let sizes = autoFitSizeCache.get(layer);
    if (!sizes) { sizes = new Map(); autoFitSizeCache.set(layer, sizes); }
    if (sizes.size >= 24) sizes.delete(sizes.keys().next().value ?? "");
    sizes.set(cacheKey, nextFontSize);
    setFontSize(nextFontSize);

    return () => probes.forEach((probe) => probe.remove());
  }, [boxSize.height, boxSize.width, layer, text]);

  // Verify the real rendered node as a final guard. Rich text elements and
  // browser font metrics can differ slightly from a detached measurement
  // probe, so reduce only when the actual content still overflows the box.
  useLayoutEffect(() => {
    const host = textRef.current;
    const content = host?.firstElementChild;
    if (!host || !(content instanceof HTMLElement) || host.clientHeight <= 16 || fontSize <= 6) {
      return;
    }

    const availableHeight = host.clientHeight - 16;
    const requiredHeight = content.scrollHeight;
    if (requiredHeight <= availableHeight) {
      return;
    }

    const correction = Math.max(0.5, Math.min(0.98, availableHeight / requiredHeight));
    const corrected = Math.max(6, Math.round(fontSize * correction * 100) / 100);
    if (corrected < fontSize) {
      autoFitSizeCache.get(layer)?.set(`${Math.max(1, host.clientWidth - 16)}:${Math.max(1, host.clientHeight - 16)}:${text}`, corrected);
      setFontSize(corrected);
    }
  }, [fontSize, layer, text]);

  const contentStyle: CSSProperties = {
    display: "block",
    width: "100%",
    minWidth: 0,
    backgroundColor: layer.lineBackgroundColor || "transparent",
    boxDecorationBreak: "clone",
    WebkitBoxDecorationBreak: "clone",
    animation: layer.scrollDuration && layer.scrollDuration > 0 ? `templateTextScroll ${layer.scrollDuration}s linear infinite` : "none",
    ...({ "--template-scroll-gap": `${layer.scrollGap ?? 100}px` } as CSSProperties),
  };

  return (
    <div ref={textRef} style={textLayerStyle(layer, fontSize)}>
      <span style={contentStyle} dangerouslySetInnerHTML={{ __html: text }} />
    </div>
  );
}

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
          {layer.shapeKind === "line" ? <polyline points={points} fill="none" stroke={layer.borderColor || layer.fill || "none"} strokeWidth={Math.max(0.5, layer.borderWidth)} strokeDasharray={strokeDasharray} strokeLinecap={layer.borderLineCap ?? "round"} strokeLinejoin={layer.borderLineJoin ?? "round"} vectorEffect="non-scaling-stroke" /> : <polygon points={points} fill={layer.fill || "transparent"} stroke={hasOutline ? layer.borderColor : "none"} strokeWidth={hasOutline ? Math.max(0.5, layer.borderWidth) : 0} strokeDasharray={strokeDasharray} strokeLinejoin={layer.borderLineJoin ?? "round"} vectorEffect="non-scaling-stroke" />}
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

interface PreparedScene {
  scene: TemplateScene;
  slide: ProjectorSlide;
  category: "scriptures" | "songs";
  backgroundKey: string;
}

function sceneBackgroundKey(scene: TemplateScene): string {
  const media = scene.backgroundMedia;
  const camera = scene.cameraMedia ?? (media?.type === "camera" ? media : null);
  const mediaKey = !media || media.type === "camera"
    ? "none"
    : `${media.type}:${media.src}`;
  const cameraKey = camera
    ? `camera:${camera.cameraSourceType}:${camera.cameraDeviceId}:${camera.cameraLabel}:${camera.cameraUrl}`
    : "none";
  return mediaKey === "none" && cameraKey === "none" ? "static" : `${mediaKey}|${cameraKey}`;
}

/** Keep the complete outgoing slide visible while the next canvas background gets its first frame. */
function PreparedSceneHandoff({
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

interface PreparedMedia {
  media: ProjectorMedia;
  source: string;
  key: string;
}

function ProjectedAudioLayer({ entry, visible, playing, loop, enabled, muted, owner, outputProgress, peaks, minPeaks, maxPeaks, waveformDuration, loading, error, onReady, onAudioElementChange, onPlaybackChange, onSeek, onProgress }: {
  entry: PreparedMedia;
  visible: boolean;
  playing: boolean;
  loop: boolean;
  enabled: boolean;
  muted: boolean;
  owner: "live" | "preview";
  outputProgress?: ProjectorAudioProgress | null;
  peaks: number[];
  minPeaks: number[];
  maxPeaks: number[];
  waveformDuration: number;
  loading: boolean;
  error: string | null;
  onReady: () => void;
  onAudioElementChange: (audio: HTMLAudioElement | null, removedAudio?: HTMLAudioElement) => void;
  onPlaybackChange?: (patch: Partial<Pick<ProjectorPlaybackState, "playing" | "looping">>) => void;
  onSeek?: (time: number) => void;
  onProgress: (time: number, duration: number) => void;
}) {
  const trimStart = entry.media.audioSettings?.trimStart ?? 0;
  const trimEnd = entry.media.audioSettings?.trimEnd ?? null;
  const volume = Math.max(0, Math.min(1, entry.media.audioSettings?.volume ?? 1));
  const playbackError = entry.media.audioPlaybackError ?? null;
  const [currentTime, setCurrentTime] = useState(trimStart);
  const [elementDuration, setElementDuration] = useState(0);
  const [localPlaybackError, setLocalPlaybackError] = useState<string | null>(null);
  const syncedOutput = muted && outputProgress?.path === entry.media.path ? outputProgress : null;
  const displayTime = syncedOutput?.time ?? currentTime;
  const totalDuration = waveformDuration || syncedOutput?.duration || elementDuration;

  useEffect(() => onReady(), [onReady]);

  useEffect(() => {
    if (muted) return;

    const sharedAudio = getSharedAudioElement();
    if (!enabled || !playing) {
      if (sharedAudio.src === entry.source) pauseSharedAudioPlayback(owner);
      return;
    }
    if (!visible) return;

    const desiredLoop = loop && trimEnd == null;
    if (getSharedAudioOwner() === owner && sharedAudio.src === entry.source && !sharedAudio.paused && sharedAudio.volume === volume && sharedAudio.loop === desiredLoop) return;
    let active = true;
    void startSharedAudioPlayback(entry.source, { volume, trimStart, trimEnd, loop }, owner).then((started) => {
      if (!active || !started) return;
      setLocalPlaybackError(null);
      if (owner === "live") useProjectorStore.getState().setLiveAudioPlaybackError(entry.media.path, null);
    }).catch((playError: unknown) => {
      if (!active || getSharedAudioOwner() !== owner) return;
      const message = audioPlaybackErrorMessage(playError, sharedAudio);
      console.error(`[ProjectorView] audio playback failed for ${entry.media.name}: ${message}`, playError);
      setLocalPlaybackError(message);
      if (owner === "live") useProjectorStore.getState().setLiveAudioPlaybackError(entry.media.path, message);
      onPlaybackChange?.({ playing: false });
    });
    return () => { active = false; };
  }, [enabled, entry.media.name, entry.media.path, entry.source, loop, muted, onPlaybackChange, owner, playing, trimEnd, trimStart, visible, volume]);

  const seek = (time: number) => {
    if (getSharedAudioOwner() !== owner) return;
    const audio = muted ? null : getSharedAudioElement();
    if (!audio || !Number.isFinite(time)) return;
    seekAudioElement(audio, time);
    setCurrentTime(time);
    onSeek?.(time);
  };

  const syncAudio = useCallback((audio: HTMLAudioElement) => {
    if (getSharedAudioOwner() !== owner) return;
    const time = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const length = Number.isFinite(audio.duration) ? audio.duration : 0;
    setCurrentTime(time);
    setElementDuration(length);
    onProgress(time, length);
  }, [onProgress, owner]);

  const handleTimeUpdate = useCallback((audio: HTMLAudioElement) => {
    if (getSharedAudioOwner() !== owner) return;
    syncAudio(audio);
    if (trimEnd == null || audio.currentTime < trimEnd) return;
    if (loop) {
      audio.currentTime = trimStart;
      if (enabled && playing) void audio.play().catch(() => undefined);
    } else {
      audio.pause();
      onPlaybackChange?.({ playing: false });
    }
  }, [enabled, loop, onPlaybackChange, owner, playing, syncAudio, trimEnd, trimStart]);

  useEffect(() => {
    if (muted) return;
    const audio = getSharedAudioElement();
    if (visible && getSharedAudioOwner() === owner) onAudioElementChange(audio);
    const handleLoadedMetadata = () => {
      if (getSharedAudioOwner() !== owner) return;
      syncAudio(audio);
      if (audio.currentTime < trimStart || (trimEnd != null && audio.currentTime >= trimEnd)) {
        try { audio.currentTime = trimStart; } catch { /* Metadata may still be settling. */ }
      }
      onReady();
    };
    const handleDurationChange = () => syncAudio(audio);
    const handleTimeUpdateEvent = () => handleTimeUpdate(audio);
    const handleEnded = () => {
      if (getSharedAudioOwner() !== owner) return;
      if (loop) {
        audio.currentTime = trimStart;
        if (enabled && playing) void audio.play().catch(() => undefined);
      } else {
        onPlaybackChange?.({ playing: false });
      }
    };
    const handleError = () => {
      if (getSharedAudioOwner() !== owner) return;
      const message = audioPlaybackErrorMessage(audio.error, audio);
      setLocalPlaybackError(message);
      if (owner === "live") useProjectorStore.getState().setLiveAudioPlaybackError(entry.media.path, message);
      onPlaybackChange?.({ playing: false });
    };
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("timeupdate", handleTimeUpdateEvent);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("timeupdate", handleTimeUpdateEvent);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [enabled, entry.media.path, handleTimeUpdate, loop, muted, onAudioElementChange, onPlaybackChange, onReady, owner, playing, syncAudio, trimEnd, trimStart, visible]);

  return (
    <div data-projector-audio="" aria-label={`Audio track ${entry.media.name}`} style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3vh", padding: "8%", boxSizing: "border-box", color: "#fff", background: "#111" }}>
      <div style={{ width: "100%", maxWidth: 1500, color: "rgba(255,255,255,.86)", fontFamily: "var(--font-sans)", fontSize: "clamp(18px, 3vw, 42px)", fontWeight: 600, textAlign: "center", overflowWrap: "anywhere" }}>{entry.media.name}</div>
      {loading ? <div style={{ width: "100%", maxWidth: 1500, height: 180, display: "grid", placeItems: "center", color: "rgba(255,255,255,.55)", fontSize: 16 }}>Loading waveform...</div> : error ? <div role="status" style={{ color: "rgba(255,255,255,.65)", fontSize: 16 }}>Waveform unavailable</div> : (
        minPeaks.length > 0 && minPeaks.length === maxPeaks.length ? (
          <LiveWaveform minPeaks={minPeaks} maxPeaks={maxPeaks} duration={totalDuration} currentTime={displayTime} playing={playing} getCurrentTime={muted ? undefined : () => getSharedAudioOwner() === owner ? getSharedAudioElement().currentTime : currentTime} onSeek={muted ? undefined : seek} height={180} style={{ width: "100%", maxWidth: 1500 }} />
        ) : (
          <WaveformCanvas peaks={peaks} duration={totalDuration} currentTime={displayTime} trimStart={trimStart} trimEnd={trimEnd} height={180} barColor="rgba(255,255,255,.38)" progressColor="#56d6b0" onSeek={seek} style={{ width: "100%", maxWidth: 1500 }} />
        )
      )}
      <div style={{ color: "rgba(255,255,255,.58)", fontFamily: "var(--font-mono)", fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{formatMediaTime(displayTime)} / {formatMediaTime(totalDuration)}</div>
      {playbackError || localPlaybackError ? <div role="alert" style={{ maxWidth: 720, color: "#ffb3b3", fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "center", overflowWrap: "anywhere" }}>Playback failed: {playbackError ?? localPlaybackError}</div> : null}
    </div>
  );
}

function formatMediaTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const wholeSeconds = Math.floor(seconds);
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

function seekAudioElement(audio: HTMLAudioElement, time: number) {
  audio.currentTime = time;
}

function PreparedMediaLayer({ entry, visible, preparing, outgoing, playing, loop, audioEnabled, muted, audioOwner, outputProgress, audioPeaks, audioMinPeaks, audioMaxPeaks, audioDuration, audioLoading, audioError, onReady, onVideoElementChange, onAudioElementChange, onPlaybackChange, onSeek, onAudioProgress }: {
  entry: PreparedMedia;
  visible: boolean;
  preparing: boolean;
  outgoing: boolean;
  playing: boolean;
  loop: boolean;
  audioEnabled: boolean;
  muted: boolean;
  audioOwner: "live" | "preview";
  outputProgress?: ProjectorAudioProgress | null;
  audioPeaks: number[];
  audioMinPeaks: number[];
  audioMaxPeaks: number[];
  audioDuration: number;
  audioLoading: boolean;
  audioError: string | null;
  onReady: () => void;
  onVideoElementChange: (video: HTMLVideoElement | null, removedVideo?: HTMLVideoElement) => void;
  onAudioElementChange: (audio: HTMLAudioElement | null, removedAudio?: HTMLAudioElement) => void;
  onPlaybackChange?: (patch: Partial<Pick<ProjectorPlaybackState, "playing" | "looping">>) => void;
  onSeek?: (time: number) => void;
  onAudioProgress: (time: number, duration: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const visibleRef = useRef(visible);
  useLayoutEffect(() => { visibleRef.current = visible; }, [visible]);
  const captureVideo = useCallback((video: HTMLVideoElement | null, removedVideo?: HTMLVideoElement) => {
    if (!video && removedVideo && videoRef.current !== removedVideo) return;
    videoRef.current = video;
    if (visibleRef.current) onVideoElementChange(video, removedVideo);
  }, [onVideoElementChange]);

  useLayoutEffect(() => {
    if (visible && entry.media.category === "videos") onVideoElementChange(videoRef.current);
  }, [entry.media.category, onVideoElementChange, visible]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const captureAudio = useCallback((audio: HTMLAudioElement | null, removedAudio?: HTMLAudioElement) => {
    if (!audio && removedAudio && audioRef.current !== removedAudio) return;
    audioRef.current = audio;
    if (visibleRef.current) onAudioElementChange(audio, removedAudio);
  }, [onAudioElementChange]);

  useLayoutEffect(() => {
    if (visible && entry.media.category === "audio") onAudioElementChange(audioRef.current);
  }, [entry.media.category, onAudioElementChange, visible]);

  return (
    <div
      data-projector-media-layer={preparing ? "preparing" : outgoing ? "outgoing" : "visible"}
      data-media-path={entry.media.path}
      style={{ position: "absolute", inset: 0, zIndex: preparing ? 0 : outgoing ? 0 : 1, opacity: preparing ? 0.001 : 1, pointerEvents: "none" }}
    >
      {entry.media.category === "videos" ? (
        <ResilientVideo
          media={{ type: "video", src: entry.source, fit: entry.media.fit, loop: true, x: 0, y: 0, width: 100, height: 100, opacity: entry.media.opacity, muted: true, speed: 1 }}
          sourcePath={entry.media.path}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: entry.media.fit, opacity: entry.media.opacity }}
          autoPlay
          playing={playing}
          loop={loop}
          preload="auto"
          onReady={preparing ? onReady : undefined}
          presentationVisible={visible}
          onVideoElementChange={captureVideo}
        />
      ) : entry.media.category === "audio" ? (
        <ProjectedAudioLayer entry={entry} visible={visible} playing={playing} loop={loop} enabled={audioEnabled} muted={muted} owner={audioOwner} outputProgress={outputProgress} peaks={audioPeaks} minPeaks={audioMinPeaks} maxPeaks={audioMaxPeaks} waveformDuration={audioDuration} loading={audioLoading} error={audioError} onReady={preparing ? onReady : () => undefined} onAudioElementChange={captureAudio} onPlaybackChange={onPlaybackChange} onSeek={onSeek} onProgress={onAudioProgress} />
      ) : (
        <ResilientImage src={entry.source} sourcePath={entry.media.path} alt={entry.media.name} onLoad={preparing ? onReady : undefined} onUnavailable={preparing ? onReady : undefined} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: entry.media.fit, opacity: entry.media.opacity }} />
      )}
    </div>
  );
}

/** Decode the incoming media behind the current frame, then reveal it. */
function PreparedMediaHandoff({ media, source, hidden, clearTransition, playing, loop, audioEnabled, muted, audioOwner, outputProgress, audioPeaks, audioMinPeaks, audioMaxPeaks, audioDuration, audioLoading, audioError, onVideoElementChange, onAudioElementChange, onPlaybackChange, onSeek, onAudioProgress, onForegroundReady, retain }: {
  media: ProjectorMedia | null;
  source: string;
  hidden: boolean;
  clearTransition?: TransitionSetting;
  playing: boolean;
  loop: boolean;
  audioEnabled: boolean;
  muted: boolean;
  audioOwner: "live" | "preview";
  outputProgress?: ProjectorAudioProgress | null;
  audioPeaks: number[];
  audioMinPeaks: number[];
  audioMaxPeaks: number[];
  audioDuration: number;
  audioLoading: boolean;
  audioError: string | null;
  onVideoElementChange: (video: HTMLVideoElement | null, removedVideo?: HTMLVideoElement) => void;
  onAudioElementChange: (audio: HTMLAudioElement | null, removedAudio?: HTMLAudioElement) => void;
  onPlaybackChange?: (patch: Partial<Pick<ProjectorPlaybackState, "playing" | "looping">>) => void;
  onSeek?: (time: number) => void;
  onAudioProgress: (time: number, duration: number) => void;
  onForegroundReady: () => void;
  retain: boolean;
}) {
  const target = useMemo<PreparedMedia | null>(() => media && source ? ({ media, source, key: `${media.category}:${source}` }) : null, [media, source]);
  const [displayed, setDisplayed] = useState<PreparedMedia | null>(null);
  const [outgoing, setOutgoing] = useState<PreparedMedia | null>(null);
  const shown = target && displayed?.key === target.key ? target : displayed;
  const pending = target && shown?.key !== target.key ? target : null;

  const reveal = useCallback(() => {
    if (!pending) return;
    setOutgoing(shown);
    setDisplayed(pending);
    onForegroundReady();
  }, [onForegroundReady, pending, shown]);

  useEffect(() => {
    if (target && !pending) onForegroundReady();
  }, [onForegroundReady, pending, target]);

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

  const entries = [outgoing, shown, pending].filter((entry, index, all): entry is PreparedMedia =>
    entry !== null && all.findIndex((candidate) => candidate?.key === entry.key) === index,
  );

  if (entries.length === 0) return null;

  return (
    <div data-projector-media="" aria-hidden={hidden} style={{ position: "absolute", inset: 0, opacity: hidden ? 0 : 1, transition: fadeTransition(clearTransition) }}>
      {entries.map((entry) => (
        <PreparedMediaLayer
          key={entry.key}
          entry={entry}
          visible={entry.key === shown?.key && entry.key !== pending?.key}
          preparing={entry.key === pending?.key}
          outgoing={entry.key === outgoing?.key}
          playing={playing}
          loop={loop}
          audioEnabled={audioEnabled && entry.key === target?.key}
          muted={muted}
          audioOwner={audioOwner}
          outputProgress={outputProgress}
          audioPeaks={audioPeaks}
          audioMinPeaks={audioMinPeaks}
          audioMaxPeaks={audioMaxPeaks}
          audioDuration={audioDuration}
          audioLoading={audioLoading}
          audioError={audioError}
          onReady={reveal}
          onVideoElementChange={onVideoElementChange}
          onAudioElementChange={onAudioElementChange}
          onPlaybackChange={onPlaybackChange}
          onSeek={onSeek}
          onAudioProgress={onAudioProgress}
        />
      ))}
    </div>
  );
}

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
