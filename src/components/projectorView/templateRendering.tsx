import { type CSSProperties } from "react";
import { resolveRichTextTokens } from "../../lib/richText";
import { ResilientVideo } from "../ResilientVideo";
import type { TemplateLayer, TemplateTextScript } from "../../types/templates";
import type { ProjectorSlide } from "../../types/state";
import { referenceLabel, textLayerStyle } from "./slideUtils";
import { AutoFitTemplateText } from "./AutoFitTemplateText";

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

export function resolveLayerText(content: string, slide: ProjectorSlide, category: "scriptures" | "songs", scriptStyles: Record<string, TemplateTextScript> = {}, backgroundStyles: Record<string, string> = {}) {
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

export function renderTemplateLayer(layer: TemplateLayer, text: string, isThumbnail = false) {
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
