/** Converts a pre-studio (layer-based) template into a Fabric studio document. */
import type { TemplateCanvasTheme } from "../../../types/templates";
import type { StudioDocument } from "../../../types/studioDocument";

export function studioDocumentFromLegacyTemplate(template: TemplateCanvasTheme): StudioDocument {
  const { scene } = template;
  const width = scene.canvasWidth;
  const height = scene.canvasHeight;
  const objects = [...scene.layers].sort((a, b) => a.zIndex - b.zIndex).map((layer) => {
    const base = {
      left: layer.x / 100 * width,
      top: layer.y / 100 * height,
      width: layer.width / 100 * width,
      height: layer.height / 100 * height,
      angle: layer.rotation,
      opacity: layer.opacity,
      visible: layer.visible,
      selectable: !layer.locked,
      evented: !layer.locked,
      studioId: layer.id,
      studioRole: "layer" as const,
      studioName: layer.name,
      studioLocked: layer.locked,
    };
    if (layer.type === "text") {
      return {
        ...base,
        type: "Textbox",
        text: layer.content,
        fill: layer.color,
        stroke: layer.outlineColor || null,
        strokeWidth: layer.outlineWidth,
        fontFamily: layer.fontFamily === "var(--font-sans)" ? "Inter, system-ui, sans-serif" : layer.fontFamily,
        fontStyle: layer.fontStyle,
        fontSize: layer.fontSize,
        fontWeight: layer.fontWeight,
        textAlign: layer.align,
        lineHeight: layer.lineHeight,
        lineSpacing: layer.lineSpacing,
        charSpacing: layer.charSpacing,
        backgroundColor: layer.backgroundColor,
        cornerRadius: layer.cornerRadius,
        lineBackgroundColor: layer.lineBackgroundColor,
        shadow: layer.shadow,
        scrollDuration: layer.scrollDuration,
        scrollGap: layer.scrollGap,
        studioBoxHeight: base.height,
        autoSize: layer.autoFit === "grow" ? "Grow to fit" : layer.autoFit === "shrink" ? "Shrink to fit" : "None",
      };
    }
    return {
      ...base,
      type: layer.shapeKind === "circle" ? "Ellipse" : layer.shapeKind === "triangle" ? "Triangle" : layer.shapeKind === "line" ? "Line" : layer.shapeKind === "arrow" || layer.shapeKind === "polygon" || layer.shapeKind === "star" ? "Polygon" : "Rect",
      studioShapeKind: layer.shapeKind,
      fill: layer.fill,
      stroke: layer.borderColor || null,
      strokeWidth: layer.borderWidth,
      strokeDashArray: layer.borderDash === "dashed" ? [12, 8] : layer.borderDash === "dotted" ? [1, 6] : null,
      strokeLineCap: layer.borderLineCap,
      strokeLineJoin: layer.borderLineJoin,
      globalCompositeOperation: layer.blendMode,
      flipX: layer.flipX,
      flipY: layer.flipY,
      shadow: layer.shadow,
      polygonSides: layer.polygonSides,
      starPoints: layer.starPoints,
      starInnerRadius: layer.starInnerRadius,
      ...(layer.shapeKind === "circle" ? { rx: base.width / 2, ry: base.height / 2 } : { rx: layer.radius, ry: layer.radius }),
    };
  });
  const now = Date.now();
  return {
    id: `studio-${template.id}`,
    name: template.name,
    category: template.category,
    width,
    height,
    background: scene.backgroundStart,
    fabricVersion: "7.0.0",
    objects,
    createdAt: template.createdAt,
    updatedAt: now,
  };
}
