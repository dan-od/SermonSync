import type { CSSProperties } from "react";

import { resolveRichTextTokens } from "../../lib/richText";
import type { TemplateLayer, TemplateTextScript } from "../../types/templates";
import type { ProjectorSlide } from "../../types/state";

function referenceLabel(slide: ProjectorSlide) {
  return `${slide.reference.book} ${slide.reference.chapter}:${slide.reference.verse}`;
}

export type LayerAnimField = "bookChapter" | "verse" | "version" | "text";
export type LayerAnimKeys = Record<LayerAnimField, number>;

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

export function layerAnimationKeyFor(dynamicTokens: string[], keys: LayerAnimKeys) {
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

export function inferSlideCategory(slide: ProjectorSlide): "scriptures" | "songs" {
  const book = slide.reference.book.trim().toLowerCase();
  if (slide.version === "SONG" || book === "song") {
    return "songs";
  }
  return "scriptures";
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

export function textLayerStyle(layer: Extract<TemplateLayer, { type: "text" }>, fontSize = layer.fontSize): CSSProperties {
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
