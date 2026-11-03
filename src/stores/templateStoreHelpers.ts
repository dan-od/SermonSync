import { saveTemplateThemes } from "../lib/templateStorage";
import type {
  TemplateBackgroundMedia,
  TemplateCategory,
  TemplateCanvasTheme,
  TemplateLayer,
  TemplateShapeLayer,
  TemplateTextLayer,
  TemplateThemeDocument,
} from "../types/templates";
import type { OverlayMode } from "../types/state";

export interface TemplateStore {
  initialized: boolean;
  loading: boolean;
  error: string | null;
  templates: TemplateCanvasTheme[];
  defaults: Record<TemplateCategory, Record<OverlayMode, string | null>>;
  initialize: () => Promise<void>;
  reload: () => Promise<void>;
  upsertTemplate: (template: TemplateCanvasTheme) => Promise<void>;
  createTemplateDraft: (category: TemplateCategory) => TemplateCanvasTheme;
  makeDefault: (category: TemplateCategory, layout: OverlayMode, templateId: string) => Promise<void>;
  setDefaultBackground: (category: TemplateCategory, media: TemplateBackgroundMedia) => Promise<number>;
  renameTemplate: (templateId: string, name: string) => Promise<void>;
  deleteTemplate: (templateId: string) => Promise<void>;
  duplicateTemplate: (templateId: string) => Promise<void>;
  patchTemplateScene: (
    templateId: string,
    updater: (current: TemplateCanvasTheme) => TemplateCanvasTheme,
  ) => TemplateCanvasTheme | null;
  updateCanvasSize: (templateId: string, width: number, height: number) => TemplateCanvasTheme | null;
  setBackgroundMedia: (templateId: string, media: TemplateBackgroundMedia | null) => TemplateCanvasTheme | null;
  patchBackgroundMedia: (templateId: string, patch: Partial<TemplateBackgroundMedia>) => TemplateCanvasTheme | null;
  addTextLayer: (templateId: string) => TemplateCanvasTheme | null;
  addShapeLayer: (templateId: string) => TemplateCanvasTheme | null;
  patchLayer: (templateId: string, layerId: string, patch: Partial<Omit<TemplateLayer, "type">>) => TemplateCanvasTheme | null;
  patchTextLayer: (templateId: string, layerId: string, patch: Partial<TemplateTextLayer>) => TemplateCanvasTheme | null;
  patchShapeLayer: (templateId: string, layerId: string, patch: Partial<TemplateShapeLayer>) => TemplateCanvasTheme | null;
  toggleLayerVisibility: (templateId: string, layerId: string) => TemplateCanvasTheme | null;
  toggleLayerLock: (templateId: string, layerId: string) => TemplateCanvasTheme | null;
  moveLayerForward: (templateId: string, layerId: string) => TemplateCanvasTheme | null;
  moveLayerBackward: (templateId: string, layerId: string) => TemplateCanvasTheme | null;
  duplicateLayer: (templateId: string, layerId: string) => TemplateCanvasTheme | null;
  deleteLayer: (templateId: string, layerId: string) => TemplateCanvasTheme | null;
}

export function toDocument(templates: TemplateCanvasTheme[], defaults: Record<TemplateCategory, Record<OverlayMode, string | null>>): TemplateThemeDocument {
  return {
    version: 2,
    templates,
    defaults,
  };
}

export function persist(templates: TemplateCanvasTheme[], defaults: Record<TemplateCategory, Record<OverlayMode, string | null>>) {
  // Fire-and-forget: persistence must never block the UI from reflecting scene edits instantly.
  void saveTemplateThemes(toDocument(templates, defaults)).catch((error) => {
    console.error("Failed to persist template themes", error);
  });
}
