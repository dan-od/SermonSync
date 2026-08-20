import { invoke } from "@tauri-apps/api/core";

import type {
  TemplateBackgroundMedia,
  TemplateCategory,
  TemplateCanvasTheme,
  TemplateLayer,
  TemplateMediaFit,
  TemplateScene,
  TemplateThemeDocument,
} from "../types/templates";

const DEFAULT_CANVAS_WIDTH = 1920;
const DEFAULT_CANVAS_HEIGHT = 1080;

const LOCAL_STORAGE_KEY = "sermonsync-template-themes-v1";

const FALLBACK_THEMES: TemplateCanvasTheme[] = [
  {
    id: "tpl-scripture-grace-dawn",
    category: "scriptures",
    name: "Grace Dawn",
    subtitle: "Soft gold lower-third with calm serif text.",
    accent: "#9f79f4",
    backgroundStart: "#55308a",
    backgroundEnd: "#090a13",
    label: "SCRIPTURE THEME",
    lines: ["John 1:16", "Grace upon grace", "Warm morning tone"],
    textAlign: "left",
    fontScale: 1,
    showLabelBadge: true,
    scene: {
      aspectRatio: "16:9",
      canvasWidth: DEFAULT_CANVAS_WIDTH,
      canvasHeight: DEFAULT_CANVAS_HEIGHT,
      backgroundStart: "#55308a",
      backgroundEnd: "#090a13",
      backgroundOverlayOpacity: 0.35,
      backgroundMedia: null,
      layers: [
        {
          id: "shape-1",
          name: "Text Backdrop",
          type: "shape",
          shapeKind: "rectangle",
          visible: true,
          locked: false,
          x: 12,
          y: 56,
          width: 76,
          height: 30,
          rotation: 0,
          zIndex: 1,
          opacity: 0.7,
          fill: "#101319",
          borderColor: "#9f79f4",
          borderWidth: 1,
          radius: 12,
        },
        {
          id: "text-1",
          name: "Main Text",
          type: "text",
          visible: true,
          locked: false,
          x: 16,
          y: 60,
          width: 68,
          height: 22,
          rotation: 0,
          zIndex: 2,
          opacity: 1,
          content: "{scripture_text}",
          color: "#f4f7ff",
          outlineColor: "",
          outlineWidth: 0,
          fontFamily: "var(--font-sans)",
          fontStyle: "normal",
          fontSize: 30,
          fontWeight: 700,
          align: "left",
          lineHeight: 1.2,
        },
      ],
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: "tpl-song-worship-bloom",
    category: "songs",
    name: "Worship Bloom",
    subtitle: "Gradient chorus card with centered lyrics.",
    accent: "#ff7e6b",
    backgroundStart: "#6a2f2b",
    backgroundEnd: "#090a13",
    label: "SONG THEME",
    lines: ["Verse 1", "In Christ alone", "Center stage"],
    textAlign: "center",
    fontScale: 1,
    showLabelBadge: true,
    scene: {
      aspectRatio: "16:9",
      canvasWidth: DEFAULT_CANVAS_WIDTH,
      canvasHeight: DEFAULT_CANVAS_HEIGHT,
      backgroundStart: "#6a2f2b",
      backgroundEnd: "#090a13",
      backgroundOverlayOpacity: 0.35,
      backgroundMedia: null,
      layers: [
        {
          id: "shape-1",
          name: "Lyric Backdrop",
          type: "shape",
          shapeKind: "rectangle",
          visible: true,
          locked: false,
          x: 14,
          y: 58,
          width: 72,
          height: 28,
          rotation: 0,
          zIndex: 1,
          opacity: 0.66,
          fill: "#101319",
          borderColor: "#ff7e6b",
          borderWidth: 1,
          radius: 12,
        },
        {
          id: "text-1",
          name: "Main Lyrics",
          type: "text",
          visible: true,
          locked: false,
          x: 18,
          y: 61,
          width: 64,
          height: 22,
          rotation: 0,
          zIndex: 2,
          opacity: 1,
          content: "{song_lines}",
          color: "#f4f7ff",
          outlineColor: "",
          outlineWidth: 0,
          fontFamily: "var(--font-sans)",
          fontStyle: "normal",
          fontSize: 30,
          fontWeight: 700,
          align: "center",
          lineHeight: 1.2,
        },
      ],
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

function makeDefaultDocument(): TemplateThemeDocument {
  return {
    version: 1,
    templates: FALLBACK_THEMES,
    defaults: {
      scriptures: FALLBACK_THEMES.find((entry) => entry.category === "scriptures")?.id ?? null,
      songs: FALLBACK_THEMES.find((entry) => entry.category === "songs")?.id ?? null,
    },
  };
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function isHexColor(value: string) {
  return /^#([A-Fa-f0-9]{6})$/.test(value);
}

function coerceNumber(value: unknown, fallback: number, min?: number, max?: number) {
  const raw = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const lo = min ?? raw;
  const hi = max ?? raw;
  return Math.max(lo, Math.min(hi, raw));
}

function ensureScene(theme: TemplateCanvasTheme): TemplateScene {
  const fallback = createDefaultScene(theme.backgroundStart, theme.backgroundEnd);
  const input = (theme as Partial<TemplateCanvasTheme>).scene;
  if (!input) {
    return fallback;
  }

  const layers: TemplateLayer[] = Array.isArray(input.layers)
    ? input.layers
      .map((layer, index) => {
        const base = {
          id: typeof layer.id === "string" ? layer.id : `layer-${index + 1}`,
          name: typeof layer.name === "string" ? layer.name : `Layer ${index + 1}`,
          visible: layer.visible !== false,
          locked: layer.locked === true,
          x: coerceNumber(layer.x, 20, 0, 95),
          y: coerceNumber(layer.y, 20, 0, 95),
          width: coerceNumber(layer.width, 60, 5, 100),
          height: coerceNumber(layer.height, 20, 5, 100),
          rotation: coerceNumber(layer.rotation, 0, -180, 180),
          zIndex: coerceNumber(layer.zIndex, index + 1, 0, 500),
          opacity: coerceNumber(layer.opacity, 1, 0.1, 1),
        };

        if (layer.type === "shape") {
          const shapeKind =
            layer.shapeKind === "circle" ||
            layer.shapeKind === "square" ||
            layer.shapeKind === "triangle" ||
            layer.shapeKind === "rectangle"
              ? layer.shapeKind
              : "rectangle";
          return {
            ...base,
            type: "shape" as const,
            shapeKind,
            fill: typeof layer.fill === "string" && !layer.fill
              ? ""
              : isHexColor(layer.fill)
                ? layer.fill
                : "#0f1117",
            borderColor: typeof layer.borderColor === "string" && !layer.borderColor
              ? ""
              : isHexColor(layer.borderColor)
                ? layer.borderColor
                : theme.accent,
            borderWidth: coerceNumber(layer.borderWidth, 1, 0, 12),
            radius: coerceNumber(layer.radius, 8, 0, 60),
          };
        }

        return {
          ...base,
          type: "text" as const,
          content: typeof layer.content === "string" ? layer.content : "{scripture_text}",
          color: typeof layer.color === "string" && !layer.color
            ? ""
            : isHexColor(layer.color)
              ? layer.color
              : "#f4f7ff",
          outlineColor: typeof layer.outlineColor === "string" && !layer.outlineColor
            ? ""
            : isHexColor(layer.outlineColor)
              ? layer.outlineColor
              : "",
          outlineWidth: coerceNumber(layer.outlineWidth, 0, 0, 12),
          fontFamily: typeof layer.fontFamily === "string" && layer.fontFamily.trim() ? layer.fontFamily : "var(--font-sans)",
          fontStyle: layer.fontStyle === "italic" ? "italic" : "normal",
          fontSize: coerceNumber(layer.fontSize, 30, 10, 140),
          fontWeight: coerceNumber(layer.fontWeight, 700, 300, 900),
          align: layer.align === "left" || layer.align === "right" ? layer.align : "center",
          lineHeight: coerceNumber(layer.lineHeight, 1.2, 0.8, 2),
        };
      })
    : fallback.layers;

  return {
    aspectRatio: "16:9",
    canvasWidth: coerceNumber(input.canvasWidth, DEFAULT_CANVAS_WIDTH, 320, 7680),
    canvasHeight: coerceNumber(input.canvasHeight, DEFAULT_CANVAS_HEIGHT, 180, 4320),
    backgroundStart: isHexColor(input.backgroundStart) ? input.backgroundStart : fallback.backgroundStart,
    backgroundEnd: isHexColor(input.backgroundEnd) ? input.backgroundEnd : fallback.backgroundEnd,
    backgroundOverlayOpacity: coerceNumber(input.backgroundOverlayOpacity, 0.35, 0, 1),
    backgroundMedia: sanitizeBackgroundMedia(input.backgroundMedia),
    layers: layers.length > 0 ? layers : fallback.layers,
  };
}

function sanitizeBackgroundMedia(input: unknown): TemplateBackgroundMedia | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const media = input as Partial<TemplateBackgroundMedia>;
  if (media.type !== "image" && media.type !== "video") {
    return null;
  }
  if (typeof media.src !== "string" || !media.src) {
    return null;
  }
  const fit: TemplateMediaFit = media.fit === "contain" || media.fit === "fill" ? media.fit : "cover";
  return {
    type: media.type,
    src: media.src,
    fit,
    loop: media.loop !== false,
    x: coerceNumber(media.x, 0, 0, 95),
    y: coerceNumber(media.y, 0, 0, 95),
    width: coerceNumber(media.width, 100, 5, 100),
    height: coerceNumber(media.height, 100, 5, 100),
    opacity: coerceNumber(media.opacity, 1, 0.1, 1),
  };
}

function createDefaultScene(
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

function sanitizeTheme(theme: TemplateCanvasTheme): TemplateCanvasTheme {
  const nextScale = Number.isFinite(theme.fontScale) ? theme.fontScale : 1;
  const category = theme.category === "songs" ? "songs" : "scriptures";
  const accent = isHexColor(theme.accent) ? theme.accent : "#8c62ff";
  const backgroundStart = isHexColor(theme.backgroundStart) ? theme.backgroundStart : "#493072";
  const backgroundEnd = isHexColor(theme.backgroundEnd) ? theme.backgroundEnd : "#090a13";
  const textAlign = theme.textAlign === "center" || theme.textAlign === "right" ? theme.textAlign : "left";

  const draft = {
    ...theme,
    category,
    accent,
    backgroundStart,
    backgroundEnd,
    textAlign,
  } as TemplateCanvasTheme;

  return {
    ...draft,
    name: theme.name.trim().slice(0, 80) || "Untitled Theme",
    subtitle: theme.subtitle.trim().slice(0, 180),
    accent,
    backgroundStart,
    backgroundEnd,
    label: theme.label.trim().slice(0, 32) || "THEME",
    lines: [
      (theme.lines[0] ?? "").trim().slice(0, 64),
      (theme.lines[1] ?? "").trim().slice(0, 64),
      (theme.lines[2] ?? "").trim().slice(0, 64),
    ],
    textAlign,
    fontScale: Math.max(0.75, Math.min(1.6, nextScale)),
    showLabelBadge: theme.showLabelBadge !== false,
    scene: ensureScene(draft),
    createdAt: Number.isFinite(theme.createdAt) ? theme.createdAt : Date.now(),
    updatedAt: Number.isFinite(theme.updatedAt) ? theme.updatedAt : Date.now(),
  };
}

function sanitizeDocument(value: TemplateThemeDocument): TemplateThemeDocument {
  const templateMap = new Map<string, TemplateCanvasTheme>();
  value.templates.forEach((entry) => {
    templateMap.set(entry.id, sanitizeTheme(entry));
  });

  const templates = Array.from(templateMap.values());
  const defaults = {
    scriptures: value.defaults.scriptures && templateMap.has(value.defaults.scriptures)
      ? value.defaults.scriptures
      : templates.find((entry) => entry.category === "scriptures")?.id ?? null,
    songs: value.defaults.songs && templateMap.has(value.defaults.songs)
      ? value.defaults.songs
      : templates.find((entry) => entry.category === "songs")?.id ?? null,
  };

  return {
    version: 1,
    templates,
    defaults,
  };
}

function parseDocument(input: string | null): TemplateThemeDocument {
  if (!input) {
    return makeDefaultDocument();
  }

  try {
    const parsed = JSON.parse(input) as TemplateThemeDocument;
    if (!parsed || !Array.isArray(parsed.templates) || !parsed.defaults) {
      return makeDefaultDocument();
    }
    return sanitizeDocument(parsed);
  } catch {
    return makeDefaultDocument();
  }
}

export async function loadTemplateThemes(): Promise<TemplateThemeDocument> {
  if (isTauriRuntime()) {
    try {
      const json = await invoke<string | null>("load_template_themes");
      return parseDocument(json);
    } catch {
      const local = typeof window !== "undefined" ? window.localStorage.getItem(LOCAL_STORAGE_KEY) : null;
      return parseDocument(local);
    }
  }

  const local = typeof window !== "undefined" ? window.localStorage.getItem(LOCAL_STORAGE_KEY) : null;
  return parseDocument(local);
}

export async function saveTemplateThemes(document: TemplateThemeDocument): Promise<void> {
  const sanitized = sanitizeDocument(document);
  const payload = JSON.stringify(sanitized, null, 2);

  if (isTauriRuntime()) {
    try {
      await invoke("save_template_themes", { payload });
    } catch {
      // Fall through to local storage backup.
    }
  }

  if (typeof window !== "undefined") {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, payload);
  }
}

export function createEmptyTemplate(category: TemplateCategory, index: number): TemplateCanvasTheme {
  const now = Date.now();
  const label = category === "scriptures" ? "SCRIPTURE THEME" : "SONG THEME";
  const namePrefix = category === "scriptures" ? "Scripture" : "Song";
  return {
    id: `tpl-${now}-${Math.random().toString(36).slice(2, 7)}`,
    category,
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
