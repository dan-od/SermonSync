import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { resolveRichTextTokens } from "../lib/richText";
import { projectionScene } from "../lib/projectionScene";
import { useTemplateStore } from "../stores/templateStore";
import { useProjectorStore } from "../stores/projectorStore";
import { ResilientVideo } from "./ResilientVideo";
import type { TemplateLayer, TemplateScene, TemplateTextScript } from "../types/templates";
import type { OverlayMode, ProjectorSlide, TransitionCategory, VerseTheme } from "../types/state";

const OVERLAY_WIDTH = 1920;
const OVERLAY_HEIGHT = 1080;
const VIEWPORT_SAFE_INSET = 2;

function referenceLabel(slide: ProjectorSlide) {
  return `${slide.reference.book} ${slide.reference.chapter}:${slide.reference.verse}`;
}

type LayerAnimField = "bookChapter" | "verse" | "version" | "text";
type LayerAnimKeys = Record<LayerAnimField, number>;

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
  return activeFields.map((field) => `${field}:${keys[field]}`).join("-");
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

    let best = low;
    for (let iteration = 0; iteration < 20; iteration += 1) {
      const candidate = (low + high) / 2;
      if (fits(candidate)) {
        best = candidate;
        low = candidate;
      } else {
        high = candidate;
      }
    }
    const nextFontSize = Math.max(6, Math.min(512, Math.round(best * 100) / 100));
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
    setFontSize((current) => {
      const corrected = Math.max(6, Math.round(current * correction * 100) / 100);
      return corrected < current ? corrected : current;
    });
  }, [fontSize, text]);

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

interface ProjectorViewProps {
  title: string;
  slide: ProjectorSlide | null;
  feedOverride: "live" | "logo" | "black" | "clear";
  overlayMode: OverlayMode;
  theme: VerseTheme;
  isLive: boolean;
  fontSizePx: number;
}

export function ProjectorView({ title, slide, feedOverride, overlayMode, isLive, fontSizePx }: ProjectorViewProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const backgroundVideoRef = useRef<HTMLVideoElement | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: OVERLAY_WIDTH, height: OVERLAY_HEIGHT });
  const [backgroundVideo, setBackgroundVideo] = useState<HTMLVideoElement | null>(null);
  const [isBackgroundVideoPlaying, setIsBackgroundVideoPlaying] = useState(true);
  const [isBackgroundVideoLooping, setIsBackgroundVideoLooping] = useState(true);
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
      const usableWidth = Math.max(0, bounds.width - VIEWPORT_SAFE_INSET * 2);
      const usableHeight = Math.max(0, bounds.height - VIEWPORT_SAFE_INSET * 2);
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
  }, []);

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

  const getAnimationName = () => {
    if (!transitionSetting || transitionSetting.effect === "cut" || transitionSetting.durationMs === 0) {
      return "none";
    }
    switch (transitionSetting.effect) {
      case "fade":
      case "dissolve":
        return "projFadeIn";
      case "slide-left":
      case "push-left":
      case "wipe-left":
        return "projSlideLeft";
      case "slide-right":
      case "push-right":
      case "wipe-right":
        return "projSlideRight";
      case "slide-up":
        return "projSlideUp";
      case "slide-down":
        return "projSlideDown";
      case "push-up-crossfade":
        return "projPushUpCrossfade";
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
      <div
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
        <style>{`
          @keyframes ssOnAirBlink {
            0%, 100% {
              opacity: 1;
            }
            50% {
              opacity: 0.35;
            }
          }
          @keyframes projFadeIn {
            0% { opacity: 0; }
            100% { opacity: 1; }
          }
          @keyframes projFadeOut {
            0% { opacity: 1; }
            100% { opacity: 0; }
          }
          @keyframes projSlideLeft {
            0% { transform: translate3d(100%, 0, 0); opacity: ${transitionSetting?.crossfade ? 0.2 : 1}; }
            100% { transform: translate3d(0, 0, 0); opacity: 1; }
          }
          @keyframes projSlideRight {
            0% { transform: translate3d(-100%, 0, 0); opacity: ${transitionSetting?.crossfade ? 0.2 : 1}; }
            100% { transform: translate3d(0, 0, 0); opacity: 1; }
          }
          @keyframes projSlideUp {
            0% { transform: translate3d(0, 100%, 0); opacity: ${transitionSetting?.crossfade ? 0.2 : 1}; }
            100% { transform: translate3d(0, 0, 0); opacity: 1; }
          }
          @keyframes projSlideDown {
            0% { transform: translate3d(0, -100%, 0); opacity: ${transitionSetting?.crossfade ? 0.2 : 1}; }
            100% { transform: translate3d(0, 0, 0); opacity: 1; }
          }
          @keyframes projPushUpCrossfade {
            0% { transform: translate3d(0, 100%, 0); opacity: 0.2; }
            100% { transform: translate3d(0, 0, 0); opacity: 1; }
          }
          @keyframes projZoomIn {
            0% { transform: scale3d(0.65, 0.65, 1); opacity: 0; }
            100% { transform: scale3d(1, 1, 1); opacity: 1; }
          }
          @keyframes projZoomOut {
            0% { transform: scale3d(1.35, 1.35, 1); opacity: 0; }
            100% { transform: scale3d(1, 1, 1); opacity: 1; }
          }
        `}</style>
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
      </div>
      <div
        ref={stageRef}
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingLeft: `${VIEWPORT_SAFE_INSET}px`,
          paddingRight: `${VIEWPORT_SAFE_INSET}px`,
          paddingTop: `${VIEWPORT_SAFE_INSET}px`,
          paddingBottom: `${VIEWPORT_SAFE_INSET}px`,
          overflow: "hidden",
          background: "transparent",
        }}
      >
        <div
          style={{
            width: `${viewportSize.width}px`,
            height: `${viewportSize.height}px`,
            position: "relative",
            borderRadius: "var(--radius-lg)",
            background: isBlackOverride
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
      <div style={{ display: "flex", alignItems: "center", gap: "8px", minHeight: "28px", padding: "6px 4px 0", color: "var(--fg-muted)", fontFamily: "var(--font-mono)", fontSize: "10px" }}>
        <button
          type="button"
          onClick={() => setIsBackgroundVideoPlaying((current) => !current)}
          disabled={!hasBackgroundVideo}
          aria-label={isBackgroundVideoPlaying ? `Pause ${title} background video` : `Play ${title} background video`}
          title={isBackgroundVideoPlaying ? "Pause background video" : "Play background video"}
          style={{ width: "24px", height: "22px", border: "none", borderRadius: "var(--radius-sm)", background: "var(--bg-elevated)", color: "var(--fg-base)", cursor: hasBackgroundVideo ? "pointer" : "not-allowed", opacity: hasBackgroundVideo ? 1 : 0.42, fontSize: "12px", lineHeight: 1 }}
        >
          {isBackgroundVideoPlaying ? "Ⅱ" : "▶"}
        </button>
        <input
          type="range"
          min={0}
          max={videoDuration || 1}
          step="0.01"
          value={Math.min(videoProgress, videoDuration || 1)}
          disabled={!hasBackgroundVideo || videoDuration <= 0}
          onChange={(event) => {
            const time = Number(event.target.value);
            const video = backgroundVideoRef.current;
            if (video && Number.isFinite(time)) video.currentTime = time;
            setVideoProgress(time);
          }}
          aria-label={`${title} background video progress`}
          style={{ flex: 1, minWidth: 0, accentColor: "var(--color-primary)", cursor: hasBackgroundVideo ? "pointer" : "not-allowed", opacity: hasBackgroundVideo ? 1 : 0.42 }}
        />
        <button
          type="button"
          onClick={() => setIsBackgroundVideoLooping((current) => !current)}
          disabled={!hasBackgroundVideo}
          aria-pressed={isBackgroundVideoLooping}
          aria-label={`${isBackgroundVideoLooping ? "Disable" : "Enable"} loop for ${title} background video`}
          title={isBackgroundVideoLooping ? "Loop on" : "Loop off"}
          style={{ width: "24px", height: "22px", border: "none", borderRadius: "var(--radius-sm)", background: isBackgroundVideoLooping ? "var(--color-primary-muted)" : "var(--bg-elevated)", color: isBackgroundVideoLooping ? "var(--color-primary)" : "var(--fg-muted)", cursor: hasBackgroundVideo ? "pointer" : "not-allowed", opacity: hasBackgroundVideo ? 1 : 0.42, fontSize: "15px", lineHeight: 1 }}
        >
          ↻
        </button>
      </div>
    </div>
  );
}
