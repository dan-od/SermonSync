import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { stripInlineStyleProperties } from "../../lib/richText";
import { useTemplateStore } from "../../stores/templateStore";
import type {
  TemplateBackgroundMedia,
  TemplateCategory,
  TemplateCanvasTheme,
  TemplateLayer,
  TemplateShapeKind,
  TemplateShapeLayer,
  TemplateTextLayer,
} from "../../types/templates";
import { BACKGROUND_MEDIA_ID, StudioCanvas } from "./StudioCanvas";
import { StudioInspector } from "./StudioInspector";
import { StudioToolbar } from "./StudioToolbar";

interface TemplateEditorModalProps {
  open: boolean;
  mode: "create" | "edit";
  category: TemplateCategory;
  templateId: string | null;
  onClose: () => void;
}

function toHex(value: string) {
  return /^#([A-Fa-f0-9]{6})$/.test(value) ? value : "#8c62ff";
}

function cloneTheme(theme: TemplateCanvasTheme): TemplateCanvasTheme {
  return JSON.parse(JSON.stringify(theme)) as TemplateCanvasTheme;
}

export function TemplateEditorModal({
  open,
  mode,
  category,
  templateId,
  onClose,
}: TemplateEditorModalProps) {
  const templates = useTemplateStore((s) => s.templates);
  const createTemplateDraft = useTemplateStore((s) => s.createTemplateDraft);
  const upsertTemplate = useTemplateStore((s) => s.upsertTemplate);

  const sourceTemplate = useMemo(
    () => (templateId ? templates.find((entry) => entry.id === templateId) ?? null : null),
    [templateId, templates],
  );

  const [draft, setDraft] = useState<TemplateCanvasTheme | null>(null);
  const [history, setHistory] = useState<TemplateCanvasTheme[]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyIndexRef = useRef(0);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [shapeTool, setShapeTool] = useState<TemplateShapeKind | null>(null);
  const [textEditRequest, setTextEditRequest] = useState<{ layerId: string; stamp: number } | null>(null);
  const [textEditingActive, setTextEditingActive] = useState(false);
  const [initialSignature, setInitialSignature] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const textSelectionFormatterRef = useRef<((layerId: string, patch: Partial<TemplateTextLayer>) => boolean) | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (!open) {
        setDraft(null);
        setSelectedLayerId(null);
        setShapeTool(null);
        setTextEditRequest(null);
        setTextEditingActive(false);
        return;
      }

      if (mode === "edit" && sourceTemplate) {
        const cloned = cloneTheme(sourceTemplate);
        setDraft(cloned);
        setHistory([cloneTheme(cloned)]);
        setHistoryIndex(0);
        historyIndexRef.current = 0;
        setInitialSignature(JSON.stringify(cloned));
        setSelectedLayerId(cloned.scene.layers[0]?.id ?? null);
        return;
      }

      const createdDraft = cloneTheme(createTemplateDraft(category));
      setDraft(createdDraft);
      setHistory([cloneTheme(createdDraft)]);
      setHistoryIndex(0);
      historyIndexRef.current = 0;
      setInitialSignature(JSON.stringify(createdDraft));
      setSelectedLayerId(createdDraft.scene.layers[0]?.id ?? null);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [category, createTemplateDraft, mode, open, sourceTemplate]);

  const isDirty = draft !== null && JSON.stringify(draft) !== initialSignature;

  const attemptClose = useCallback(() => {
    if (!isDirty || isSaving) {
      onClose();
      return;
    }

    if (window.confirm("Discard unsaved template changes?")) {
      onClose();
    }
  }, [isDirty, isSaving, onClose]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const mutateDraft = useCallback(
    (updater: (current: TemplateCanvasTheme) => TemplateCanvasTheme) => {
      setDraft((current) => {
        if (!current) {
          return current;
        }
        const next = { ...updater(current), updatedAt: Date.now() };
        if (
          selectedLayerId &&
          selectedLayerId !== BACKGROUND_MEDIA_ID &&
          !next.scene.layers.some((layer) => layer.id === selectedLayerId)
        ) {
          setSelectedLayerId(null);
        }
        setHistory((currentHistory) => {
          const base = currentHistory.slice(0, historyIndexRef.current + 1);
          return [...base, cloneTheme(next)];
        });
        setHistoryIndex((currentIndex) => {
          const nextIndex = currentIndex + 1;
          historyIndexRef.current = nextIndex;
          return nextIndex;
        });
        return next;
      });
    },
    [selectedLayerId],
  );

  const removeBackgroundMedia = useCallback(() => {
    mutateDraft((current) => ({
      ...current,
      scene: {
        ...current.scene,
        backgroundMedia: null,
      },
    }));
    if (selectedLayerId === BACKGROUND_MEDIA_ID) {
      setSelectedLayerId(null);
    }
  }, [mutateDraft, selectedLayerId]);

  const deleteLayerLocal = useCallback(
    (layerId: string) => {
      mutateDraft((current) => ({
        ...current,
        scene: {
          ...current.scene,
          layers: current.scene.layers.filter((layer) => layer.id !== layerId),
        },
      }));
      if (selectedLayerId === layerId) {
        setSelectedLayerId(null);
      }
    },
    [mutateDraft, selectedLayerId],
  );

  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const isCmdOrCtrl = event.metaKey || event.ctrlKey;
      if (isCmdOrCtrl && event.key.toLowerCase() === "z" && !isSaving) {
        event.preventDefault();
        if (event.shiftKey) {
          if (canRedo) {
            const nextIndex = historyIndex + 1;
            const nextDraft = history[nextIndex];
            if (nextDraft) {
              setHistoryIndex(nextIndex);
              setDraft(cloneTheme(nextDraft));
            }
          }
        } else if (canUndo) {
          const nextIndex = historyIndex - 1;
          const nextDraft = history[nextIndex];
          if (nextDraft) {
            setHistoryIndex(nextIndex);
            setDraft(cloneTheme(nextDraft));
          }
        }
        return;
      }
      if (isCmdOrCtrl && event.key.toLowerCase() === "y" && !isSaving) {
        event.preventDefault();
        if (canRedo) {
          const nextIndex = historyIndex + 1;
          const nextDraft = history[nextIndex];
          if (nextDraft) {
            setHistoryIndex(nextIndex);
            setDraft(cloneTheme(nextDraft));
          }
        }
        return;
      }
      if (event.key === "Escape" && !isSaving) {
        if (textEditingActive) {
          return;
        }
        if (selectedLayerId) {
          event.preventDefault();
          setSelectedLayerId(null);
          return;
        }
        attemptClose();
      }
      if ((event.key === "Delete" || event.key === "Backspace") && !isSaving && selectedLayerId) {
        if (textEditingActive) {
          return;
        }
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
          return;
        }
        event.preventDefault();
        if (selectedLayerId === BACKGROUND_MEDIA_ID) {
          removeBackgroundMedia();
        } else {
          deleteLayerLocal(selectedLayerId);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [attemptClose, canRedo, canUndo, deleteLayerLocal, history, historyIndex, isSaving, open, removeBackgroundMedia, selectedLayerId, textEditingActive]);

  if (!open || !draft) {
    return null;
  }

  const selectedLayer =
    selectedLayerId && selectedLayerId !== BACKGROUND_MEDIA_ID
      ? draft.scene.layers.find((layer) => layer.id === selectedLayerId) ?? null
      : null;

  const save = async () => {
    setIsSaving(true);
    try {
      await upsertTemplate({
        ...draft,
        accent: toHex(draft.accent),
        backgroundStart: toHex(draft.backgroundStart),
        backgroundEnd: toHex(draft.backgroundEnd),
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const updateSceneBackground = (key: "backgroundStart" | "backgroundEnd", value: string) => {
    mutateDraft((current) => ({
        ...current,
        [key]: value,
        scene: {
          ...current.scene,
          [key]: value,
        },
      }));
  };

  const updateLayer = (layerId: string, patch: Partial<Omit<TemplateLayer, "type">>) => {
    mutateDraft((current) => ({
      ...current,
      scene: {
        ...current.scene,
        layers: current.scene.layers.map((layer) =>
          layer.id === layerId ? { ...layer, ...patch } : layer,
        ),
      },
    }));
  };

  const TEXT_PROP_TO_CSS: Partial<Record<keyof TemplateTextLayer, string>> = {
    color: "color",
    fontFamily: "font-family",
    fontSize: "font-size",
    fontWeight: "font-weight",
    fontStyle: "font-style",
    lineHeight: "line-height",
    outlineColor: "-webkit-text-stroke-color",
    outlineWidth: "-webkit-text-stroke-width",
  };

  const updateTextLayer = (layerId: string, patch: Partial<TemplateTextLayer>) => {
    mutateDraft((current) => ({
      ...current,
      scene: {
        ...current.scene,
        layers: current.scene.layers.map((layer) => {
          if (layer.id !== layerId || layer.type !== "text") {
            return layer;
          }
          // Applying a property at the whole-textbox level (nothing highlighted) should be
          // visible everywhere, so clear any leftover per-run overrides for that property.
          const cssProps = Object.keys(patch)
            .map((key) => TEXT_PROP_TO_CSS[key as keyof TemplateTextLayer])
            .filter((prop): prop is string => Boolean(prop));
          const content = cssProps.length > 0 ? stripInlineStyleProperties(layer.content, cssProps) : layer.content;
          return { ...layer, ...patch, content };
        }),
      },
    }));
  };

  const updateShapeLayer = (layerId: string, patch: Partial<TemplateShapeLayer>) => {
    mutateDraft((current) => ({
      ...current,
      scene: {
        ...current.scene,
        layers: current.scene.layers.map((layer) => {
          if (layer.id !== layerId || layer.type !== "shape") {
            return layer;
          }
          return { ...layer, ...patch };
        }),
      },
    }));
  };

  const updateBackgroundMediaPatch = (patch: Partial<TemplateBackgroundMedia>) => {
    mutateDraft((current) => ({
      ...current,
      scene: {
        ...current.scene,
        backgroundMedia: current.scene.backgroundMedia ? { ...current.scene.backgroundMedia, ...patch } : null,
      },
    }));
  };

  const selectBackgroundMediaFile = (file: File) => {
    const type = file.type.startsWith("video/") ? "video" : "image";
    const src = URL.createObjectURL(file);
    const media: TemplateBackgroundMedia = {
      type,
      src,
      fit: "cover",
      loop: true,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      opacity: 1,
    };
    mutateDraft((current) => ({
      ...current,
      scene: {
        ...current.scene,
        backgroundMedia: media,
      },
    }));
    setSelectedLayerId(BACKGROUND_MEDIA_ID);
  };

  const addTextLayerLocal = (initialBox?: { x: number; y: number; width: number; height: number }) => {
    const layerId = `text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    mutateDraft((current) => {
      const maxZ = Math.max(0, ...current.scene.layers.map((layer) => layer.zIndex));
      const nextIndex = current.scene.layers.filter((layer) => layer.type === "text").length + 1;
      const layer: TemplateTextLayer = {
        id: layerId,
        name: `Text ${nextIndex}`,
        type: "text",
        visible: true,
        locked: false,
        x: initialBox?.x ?? 20,
        y: initialBox?.y ?? 20,
        width: initialBox?.width ?? 55,
        height: initialBox?.height ?? 18,
        rotation: 0,
        zIndex: maxZ + 1,
        opacity: 1,
        content: "",
        color: "#f4f7ff",
        outlineColor: "",
        outlineWidth: 0,
        fontFamily: "var(--font-sans)",
        fontStyle: "normal",
        fontSize: 28,
        fontWeight: 700,
        align: "center",
        lineHeight: 1.2,
      };

      return {
        ...current,
        scene: {
          ...current.scene,
          layers: [...current.scene.layers, layer],
        },
      };
    });
    setSelectedLayerId(layerId);
    setTextEditRequest({ layerId, stamp: Date.now() });
  };

  const addShapeLayerLocal = (
    shapeKind: TemplateShapeKind = "rectangle",
    initialBox?: { x: number; y: number; width: number; height: number },
  ) => {
    const layerId = `shape-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    mutateDraft((current) => {
      const maxZ = Math.max(0, ...current.scene.layers.map((layer) => layer.zIndex));
      const nextIndex = current.scene.layers.filter((layer) => layer.type === "shape").length + 1;
      const layer: TemplateShapeLayer = {
        id: layerId,
        name: `Shape ${nextIndex}`,
        type: "shape",
        shapeKind,
        visible: true,
        locked: false,
        x: initialBox?.x ?? 24,
        y: initialBox?.y ?? 24,
        width: initialBox?.width ?? 44,
        height: initialBox?.height ?? 18,
        rotation: 0,
        zIndex: maxZ + 1,
        opacity: 0.8,
        fill: "#101319",
        borderColor: current.accent,
        borderWidth: 1,
        radius: 10,
      };

      return {
        ...current,
        scene: {
          ...current.scene,
          layers: [...current.scene.layers, layer],
        },
      };
    });
    setSelectedLayerId(layerId);
  };

  const duplicateLayerLocal = (layerId: string) => {
    mutateDraft((current) => {
      const source = current.scene.layers.find((layer) => layer.id === layerId);
      if (!source) {
        return current;
      }

      const maxZ = Math.max(0, ...current.scene.layers.map((layer) => layer.zIndex));
      const copy: TemplateLayer = {
        ...source,
        id: `${source.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: `${source.name} Copy`,
        x: Math.min(95, source.x + 2),
        y: Math.min(95, source.y + 2),
        zIndex: maxZ + 1,
      };

      return {
        ...current,
        scene: {
          ...current.scene,
          layers: [...current.scene.layers, copy],
        },
      };
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Template editor"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) {
          attemptClose();
        }
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        background: "var(--overlay-backdrop)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        style={{
          width: "min(1180px, 96vw)",
          height: "min(760px, 92vh)",
          background: "var(--bg-base)",
          borderRadius: "12px",
          border: "1px solid var(--border-base)",
          display: "grid",
          gridTemplateRows: "auto minmax(0, 1fr) auto",
          overflow: "hidden",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            borderBottom: "1px solid var(--border-base)",
            padding: "10px 14px",
            background: "var(--bg-surface)",
          }}
        >
          <div style={{ display: "grid", gap: "2px" }}>
            <span style={{ color: "var(--fg-base)", fontWeight: 700, fontSize: "14px" }}>
              {mode === "edit" ? "Edit Template" : "Create Template"}
            </span>
            <span style={{ color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.06em" }}>
              CANVAS AUTHORING
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto" }}>
            <button
              type="button"
              disabled={!canUndo || isSaving}
              onClick={() => {
                if (!canUndo) {
                  return;
                }
                const nextIndex = historyIndex - 1;
                const nextDraft = history[nextIndex];
                if (nextDraft) {
                  setHistoryIndex(nextIndex);
                  setDraft(cloneTheme(nextDraft));
                }
              }}
              title="Undo (Ctrl/Cmd+Z)"
              style={{
                border: "1px solid var(--border-base)",
                background: "var(--bg-elevated)",
                color: canUndo ? "var(--fg-base)" : "var(--fg-subtle)",
                borderRadius: "6px",
                width: "28px",
                height: "28px",
                cursor: canUndo && !isSaving ? "pointer" : "not-allowed",
              }}
            >
              ↶
            </button>
            <button
              type="button"
              disabled={!canRedo || isSaving}
              onClick={() => {
                if (!canRedo) {
                  return;
                }
                const nextIndex = historyIndex + 1;
                const nextDraft = history[nextIndex];
                if (nextDraft) {
                  setHistoryIndex(nextIndex);
                  setDraft(cloneTheme(nextDraft));
                }
              }}
              title="Redo (Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z)"
              style={{
                border: "1px solid var(--border-base)",
                background: "var(--bg-elevated)",
                color: canRedo ? "var(--fg-base)" : "var(--fg-subtle)",
                borderRadius: "6px",
                width: "28px",
                height: "28px",
                cursor: canRedo && !isSaving ? "pointer" : "not-allowed",
              }}
            >
              ↷
            </button>
          </div>
          <button
            type="button"
            disabled={isSaving}
            onClick={attemptClose}
            style={{
              border: "none",
              background: "var(--bg-elevated)",
              color: "var(--fg-base)",
              borderRadius: "6px",
              width: "28px",
              height: "28px",
              cursor: isSaving ? "not-allowed" : "pointer",
            }}
            title="Close"
          >
            ×
          </button>
        </header>

        <div style={{ minHeight: 0, minWidth: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px" }}>
          <div style={{ position: "relative", minHeight: 0, minWidth: 0 }}>
            <StudioCanvas
              scene={draft.scene}
              selectedLayerId={selectedLayerId}
              onSelectLayer={setSelectedLayerId}
              onLayerPatch={(layerId, patch) => updateLayer(layerId, patch)}
              onBackgroundMediaPatch={updateBackgroundMediaPatch}
              activeShapeTool={shapeTool}
              textEditRequest={textEditRequest}
              onCreateShape={(kind, box) => {
                addShapeLayerLocal(kind, box);
              }}
              onShapeToolUsed={() => setShapeTool(null)}
              onTextEditingChange={setTextEditingActive}
              onTextEditRequestHandled={() => setTextEditRequest(null)}
              onTextSelectionFormatReady={(formatter) => {
                textSelectionFormatterRef.current = formatter;
              }}
            />
            <StudioToolbar
              hasSelection={Boolean(selectedLayer)}
              onAddTextbox={() => addTextLayerLocal()}
              onChooseShape={(kind) => setShapeTool(kind)}
              onDuplicateSelected={() => {
                if (selectedLayer) {
                  duplicateLayerLocal(selectedLayer.id);
                }
              }}
            />
          </div>

          <StudioInspector
            scene={draft.scene}
            layers={draft.scene.layers}
            selectedLayerId={selectedLayerId}
            selectedLayer={selectedLayer}
            onSelectLayer={setSelectedLayerId}
            onToggleVisibility={(layerId) =>
              mutateDraft((current) => ({
                ...current,
                scene: {
                  ...current.scene,
                  layers: current.scene.layers.map((layer) =>
                    layer.id === layerId ? { ...layer, visible: !layer.visible } : layer,
                  ),
                },
              }))
            }
            onToggleLock={(layerId) =>
              mutateDraft((current) => ({
                ...current,
                scene: {
                  ...current.scene,
                  layers: current.scene.layers.map((layer) =>
                    layer.id === layerId ? { ...layer, locked: !layer.locked } : layer,
                  ),
                },
              }))
            }
            onMoveForward={(layerId) =>
              mutateDraft((current) => ({
                ...current,
                scene: {
                  ...current.scene,
                  layers: current.scene.layers.map((layer) =>
                    layer.id === layerId ? { ...layer, zIndex: layer.zIndex + 1 } : layer,
                  ),
                },
              }))
            }
            onMoveBackward={(layerId) =>
              mutateDraft((current) => ({
                ...current,
                scene: {
                  ...current.scene,
                  layers: current.scene.layers.map((layer) =>
                    layer.id === layerId
                      ? { ...layer, zIndex: Math.max(0, layer.zIndex - 1) }
                      : layer,
                  ),
                },
              }))
            }
            onDeleteLayer={deleteLayerLocal}
            onDuplicateLayer={duplicateLayerLocal}
            onSceneBackgroundChange={updateSceneBackground}
            onCanvasSizeChange={(width, height) =>
              mutateDraft((current) => ({
                ...current,
                scene: {
                  ...current.scene,
                  canvasWidth: Math.max(320, Math.round(width)),
                  canvasHeight: Math.max(180, Math.round(height)),
                },
              }))
            }
            onBackgroundMediaSelect={selectBackgroundMediaFile}
            onBackgroundMediaPatch={updateBackgroundMediaPatch}
            onBackgroundMediaRemove={removeBackgroundMedia}
            onLayerPatch={updateLayer}
            onTextPatch={updateTextLayer}
            onTextSelectionFormat={(layerId, patch) => textSelectionFormatterRef.current?.(layerId, patch) ?? false}
            onShapePatch={updateShapeLayer}
          />
        </div>

        <footer
          style={{
            borderTop: "1px solid var(--border-base)",
            padding: "10px 14px",
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            background: "var(--bg-surface)",
          }}
        >
          <button
            type="button"
            onClick={attemptClose}
            disabled={isSaving}
            style={{
              border: "1px solid var(--border-base)",
              background: "var(--bg-elevated)",
              color: "var(--fg-base)",
              borderRadius: "8px",
              padding: "8px 12px",
              cursor: isSaving ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={isSaving}
            style={{
              border: "none",
              background: "var(--color-primary)",
              color: "white",
              borderRadius: "8px",
              padding: "8px 12px",
              fontWeight: 700,
              cursor: isSaving ? "not-allowed" : "pointer",
            }}
          >
            {isSaving ? "Saving..." : "Save Theme"}
          </button>
        </footer>
      </div>
    </div>
  );
}
