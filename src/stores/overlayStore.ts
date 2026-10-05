import { create } from "zustand";

import type { OverlayDefinition } from "../types/overlays";
import { useProjectorStore } from "./projectorStore";

const STORAGE_KEY = "sermonsync-overlays-v1";

function loadOverlays(): OverlayDefinition[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((entry): entry is OverlayDefinition => (
      Boolean(entry) && typeof entry === "object" && typeof entry.id === "string"
      && (entry.kind === "timer" || entry.kind === "alert" || entry.kind === "name" || entry.kind === "watermark" || entry.kind === "custom")
    )) : [];
  } catch {
    return [];
  }
}

function saveOverlays(overlays: OverlayDefinition[]): boolean {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overlays)); return true; }
  catch { return false; }
}

interface OverlayStore {
  overlays: OverlayDefinition[];
  upsert: (overlay: OverlayDefinition) => boolean;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
}

export const useOverlayStore = create<OverlayStore>((set, get) => ({
  overlays: loadOverlays(),
  upsert: (overlay) => {
    const next = get().overlays.some((entry) => entry.id === overlay.id)
      ? get().overlays.map((entry) => entry.id === overlay.id ? overlay : entry)
      : [overlay, ...get().overlays];
    if (!saveOverlays(next)) return false;
    set({ overlays: next });
    useProjectorStore.getState().updateActiveOverlay(overlay);
    return true;
  },
  rename: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next = get().overlays.map((entry) => entry.id === id ? { ...entry, name: trimmed, updatedAt: Date.now() } : entry);
    set({ overlays: next });
    saveOverlays(next);
    const updated = next.find((entry) => entry.id === id);
    if (updated) useProjectorStore.getState().updateActiveOverlay(updated);
  },
  remove: (id) => {
    const next = get().overlays.filter((entry) => entry.id !== id);
    set({ overlays: next });
    saveOverlays(next);
    useProjectorStore.getState().removeActiveOverlay(id);
  },
}));
