import type { TemplateCategory } from "../../../types/templates";

export function categoryLabel(category: TemplateCategory) {
  return category === "songs" ? "Song" : "Scripture";
}
