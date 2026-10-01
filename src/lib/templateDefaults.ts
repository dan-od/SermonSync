import type {
  TemplateCategory,
  TemplateCanvasTheme,
  TemplateScene,
  TemplateThemeDocument,
} from "../types/templates";
import type { OverlayMode } from "../types/state";

export const DEFAULT_CANVAS_WIDTH = 1920;
export const DEFAULT_CANVAS_HEIGHT = 1080;
export const MAX_MEDIA_SOURCE_LENGTH = 90 * 1024 * 1024;

export const LEGACY_DEFAULT_TEMPLATE_IDS = new Set([
  "tpl-scripture-grace-dawn",
  "tpl-song-worship-bloom",
]);

export function emptyDefaults(): Record<TemplateCategory, Record<OverlayMode, string | null>> {
  return {
    scriptures: { widescreen: null, "lower-third": null },
    songs: { widescreen: null, "lower-third": null },
  };
}

export function makeEmptyDocument(): TemplateThemeDocument {
  return {
    version: 2,
    templates: [],
    defaults: emptyDefaults(),
  };
}

export function createDefaultScene(
  backgroundStart: string,
  backgroundEnd: string,
): TemplateScene {
  return {
    aspectRatio: "16:9",
    canvasWidth: DEFAULT_CANVAS_WIDTH,
    canvasHeight: DEFAULT_CANVAS_HEIGHT,
    backgroundStart,
    backgroundEnd,
    backgroundOverlayOpacity: 0.35,
    backgroundMedia: null,
    // New templates are intentionally blank. Layers only appear after the user adds them.
    layers: [],
  };
}

export function createEmptyTemplate(category: TemplateCategory, index: number): TemplateCanvasTheme {
  const now = Date.now();
  const label = category === "scriptures" ? "SCRIPTURE THEME" : "SONG THEME";
  const namePrefix = category === "scriptures" ? "Scripture" : "Song";
  return {
    id: `tpl-${now}-${Math.random().toString(36).slice(2, 7)}`,
    category,
    layout: "widescreen",
    name: `${namePrefix} Template ${index}`,
    subtitle: `Custom ${namePrefix.toLowerCase()} style`,
    accent: category === "scriptures" ? "#8c62ff" : "#ff8b54",
    backgroundStart: category === "scriptures" ? "#4b2f7d" : "#6a2e23",
    backgroundEnd: "#090a13",
    label,
    lines: category === "scriptures"
      ? ["Reference", "Main scripture line", "Support line"]
      : ["Verse", "Main lyric line", "Support line"],
    textAlign: category === "scriptures" ? "left" : "center",
    fontScale: 1,
    showLabelBadge: true,
    scene: createDefaultScene(
      category === "scriptures" ? "#4b2f7d" : "#6a2e23",
      "#090a13",
    ),
    createdAt: now,
    updatedAt: now,
  };
}
