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
  { action: "send-preview-live", label: "Send preview live", category: "Local library" },
  { action: "open-settings", label: "Open settings", category: "Workspace" },
  { action: "template-undo", label: "Undo template edit", category: "Template Studio" },
  { action: "template-redo", label: "Redo template edit", category: "Template Studio" },
];

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  "feed-live": "L",
  "feed-logo": "O",
  "feed-black": "B",
  "feed-clear": "C",
  "layout-widescreen": "1",
  "layout-lower-third": "2",
  "library-previous": "ArrowLeft",
  "library-next": "ArrowRight",
  "send-preview-live": "Enter",
  "open-settings": "Ctrl+,",
  "template-undo": "Ctrl+Z",
  "template-redo": "Ctrl+R",
};

const STORAGE_KEY = "sermonsync-shortcuts-v1";

function readShortcuts(): Record<ShortcutAction, string> {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_SHORTCUTS;
    return { ...DEFAULT_SHORTCUTS, ...JSON.parse(stored) };
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
  const modifiers = [event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Meta"].filter(Boolean);
  return [...modifiers, keyName(event.key)].join("+");
}

export function isShortcutEvent(event: KeyboardEvent, binding: string): boolean {
  return shortcutFromEvent(event) === binding;
}

interface ShortcutStore {
  shortcuts: Record<ShortcutAction, string>;
  setShortcut: (action: ShortcutAction, binding: string) => void;
  resetShortcuts: () => void;
}

export const useShortcutStore = create<ShortcutStore>((set) => ({
  shortcuts: readShortcuts(),
  setShortcut: (action, binding) =>
    set((state) => {
      const shortcuts = { ...state.shortcuts, [action]: binding };
      writeShortcuts(shortcuts);
      return { shortcuts };
    }),
  resetShortcuts: () => {
    writeShortcuts(DEFAULT_SHORTCUTS);
    set({ shortcuts: { ...DEFAULT_SHORTCUTS } });
  },
}));
