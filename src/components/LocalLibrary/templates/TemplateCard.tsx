import { memo, useMemo } from "react";

import { projectionScene } from "../../../lib/projectionScene";
import type { useTemplateStore } from "../../../stores/templateStore";
import type { ProjectorSlide } from "../../../types/state";
import { TemplateSceneOverlay } from "../../ProjectorView";
import { updatedLabel } from "./templateUtils";

export const TemplateCard = memo(function TemplateCard({
  template,
  isDefault,
  onOpenEdit,
  onContextMenu,
}: {
  template: ReturnType<typeof useTemplateStore.getState>["templates"][number];
  isDefault: boolean;
  onOpenEdit: (templateId: string) => void;
  onContextMenu: (event: React.MouseEvent, templateId: string) => void;
}) {
  const scene = useMemo(() => projectionScene(template), [template]);
  const previewSlide: ProjectorSlide = {
    reference: { book: "John", chapter: 3, verse: 16 },
    text: template.category === "songs"
      ? "Amazing grace, how sweet the sound"
      : "For God so loved the world, that he gave his one and only Son.",
    version: template.category === "songs" ? "SONG" : "NIV",
  };

  return (
    <article
      onDoubleClick={() => onOpenEdit(template.id)}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu(event, template.id);
      }}
      style={{
        border: isDefault ? "1px solid var(--color-primary)" : "1px solid var(--border-base)",
        borderRadius: "10px",
        background: "var(--bg-elevated)",
        overflow: "hidden",
        boxShadow: "var(--shadow-sm)",
        cursor: "pointer",
      }}
    >
      <div style={{ aspectRatio: "16 / 9", position: "relative", overflow: "hidden", cursor: "pointer" }}>
        <TemplateSceneOverlay scene={scene} slide={previewSlide} category={template.category} fitToContainer isThumbnail />
      </div>

      <div style={{ padding: "10px", display: "grid", gap: "4px" }}>
        <span title={template.name} style={{ color: "var(--fg-base)", fontSize: "13px", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{template.name}</span>
        <div style={{ display: "flex", minHeight: "16px", alignItems: "center" }}>
          <span style={{ color: "var(--fg-base)", fontSize: "10px", fontFamily: "var(--font-mono)", fontWeight: 700, letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
            {isDefault ? "DEFAULT · " : ""}{template.layout === "lower-third" ? "LOWER THIRD" : "WIDESCREEN"}
          </span>
        </div>
        <span style={{ color: "var(--fg-muted)", fontSize: "11px", lineHeight: 1.35 }}>{template.subtitle}</span>
        <span style={{ color: "var(--fg-subtle)", fontSize: "10px", fontFamily: "var(--font-mono)", letterSpacing: "0.05em" }}>
          {updatedLabel(template.updatedAt)}
        </span>
      </div>
    </article>
  );
});
