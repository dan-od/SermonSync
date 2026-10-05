import { create } from "zustand";

export type ShortcutAction =
  | "feed-live"
  | "feed-logo"
  | "feed-black"
  | "feed-clear"
  | "layout-widescreen"
  | "layout-lower-third"
  | "library-previous"
  | "library-next"
  | "library-tab-scriptures"
  | "library-tab-songs"
  | "library-tab-media"
  | "library-tab-overlays"
  | "library-tab-templates"
  | "send-preview-live"
  | "open-settings"
  | "template-undo"
  | "template-redo";

export interface ShortcutDefinition {
  action: ShortcutAction;
  label: string;
  category: "Live feed" | "Screen layout" | "Local library" | "Workspace" | "Template Studio";
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  { action: "feed-live", label: "Live feed", category: "Live feed" },
  { action: "feed-logo", label: "Logo overlay", category: "Live feed" },
  { action: "feed-black", label: "Black overlay", category: "Live feed" },
  { action: "feed-clear", label: "Clear projected content", category: "Live feed" },
  { action: "layout-widescreen", label: "Widescreen layout", category: "Screen layout" },
  { action: "layout-lower-third", label: "Lower-third layout", category: "Screen layout" },
  { action: "library-previous", label: "Previous verse or section", category: "Local library" },
  { action: "library-next", label: "Next verse or section", category: "Local library" },
  { action: "library-tab-scriptures", label: "Scriptures tab", category: "Local library" },
  { action: "library-tab-songs", label: "Songs tab", category: "Local library" },
  { action: "library-tab-media", label: "Media tab", category: "Local library" },
  { action: "library-tab-overlays", label: "Overlays tab", category: "Local library" },
  { action: "library-tab-templates", label: "Templates tab", category: "Local library" },
  { action: "send-preview-live", label: "Send preview live", category: "Local library" },
  { action: "open-settings", label: "Open settings", category: "Workspace" },
  { action: "template-undo", label: "Undo template edit", category: "Template Studio" },
  { action: "template-redo", label: "Redo template edit", category: "Template Studio" },
];

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  "feed-live": "L",
  "feed-logo": "Ctrl+L",
  "feed-black": "Ctrl+B",
  "feed-clear": "Ctrl+C",
  "layout-widescreen": "Alt+S",
  "layout-lower-third": "2",
  "library-previous": "ArrowLeft",
  "library-next": "ArrowRight",
  "library-tab-scriptures": "Alt+1",
  "library-tab-songs": "Alt+2",
  "library-tab-media": "Alt+3",
  "library-tab-overlays": "Alt+4",
  "library-tab-templates": "Alt+5",
  "send-preview-live": "Enter",
  "open-settings": "Ctrl+,",
  "template-undo": "Ctrl+Z",
  "template-redo": "Ctrl+R",
};

const STORAGE_KEY = "sermonsync-shortcuts-v1";
const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta", "AltGraph", "OS"]);

function isModifierOnlyBinding(binding: string): boolean {
  return MODIFIER_KEYS.has(binding.split("+").at(-1) ?? "");
}

function readShortcuts(): Record<ShortcutAction, string> {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_SHORTCUTS;
    const saved = JSON.parse(stored) as Partial<Record<ShortcutAction, string>>;
    const shortcuts = { ...DEFAULT_SHORTCUTS };
    for (const action of Object.keys(DEFAULT_SHORTCUTS) as ShortcutAction[]) {
      if (typeof saved[action] === "string" && !isModifierOnlyBinding(saved[action])) {
        shortcuts[action] = saved[action];
      }
    }
    return shortcuts;
  } catch {
    return DEFAULT_SHORTCUTS;
  }
}

function writeShortcuts(shortcuts: Record<ShortcutAction, string>) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
}

function keyName(key: string) {
  if (key === " ") return "Space";
  return key.length === 1 ? key.toUpperCase() : key;
}

export function shortcutFromEvent(event: KeyboardEvent): string {
  if (MODIFIER_KEYS.has(event.key)) return "";
  const modifiers = [event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Meta"].filter(Boolean);
  return [...modifiers, keyName(event.key)].join("+");
}

export function isShortcutEvent(event: KeyboardEvent, binding: string): boolean {
  return Boolean(binding) && !isModifierOnlyBinding(binding) && shortcutFromEvent(event) === binding;
}

interface ShortcutStore {
  shortcuts: Record<ShortcutAction, string>;
  setShortcut: (action: ShortcutAction, binding: string) => void;
  resetShortcuts: () => void;
}

export const useShortcutStore = create<ShortcutStore>((set) => ({
  shortcuts: readShortcuts(),
  setShortcut: (action, binding) => {
    if (!binding || isModifierOnlyBinding(binding)) return;
    set((state) => {
      const shortcuts = { ...state.shortcuts, [action]: binding };
      for (const otherAction of Object.keys(shortcuts) as ShortcutAction[]) {
        if (otherAction !== action && shortcuts[otherAction] === binding) {
          shortcuts[otherAction] = "";
        }
      }
      writeShortcuts(shortcuts);
      return { shortcuts };
    });
  },
  resetShortcuts: () => {
    writeShortcuts(DEFAULT_SHORTCUTS);
    set({ shortcuts: { ...DEFAULT_SHORTCUTS } });
  },
}));
