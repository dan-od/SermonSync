import type { TemplateFilter } from "../types";

// ─── Templates tab ────────────────────────────────────────────────────────────

export type TemplateMenuAction = "edit" | "makeDefault" | "rename" | "delete" | "duplicate";

export interface TemplateMenuState {
  templateId: string;
  x: number;
  y: number;
}

export function templateCategoryLabel(category: TemplateFilter) {
  return category === "scriptures" ? "Scripture" : "Song";
}

export function updatedLabel(timestamp: number) {
  const deltaMs = Math.max(0, Date.now() - timestamp);
  const mins = Math.floor(deltaMs / 60000);
  if (mins < 1) {
    return "Updated now";
  }
  if (mins < 60) {
    return `Updated ${mins}m ago`;
  }
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    return `Updated ${hrs}h ago`;
  }
  return `Updated ${Math.floor(hrs / 24)}d ago`;
}
