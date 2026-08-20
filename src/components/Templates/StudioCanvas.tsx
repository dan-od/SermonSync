import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { contentToEditableHtml, isRichTextHtml, sanitizeRichTextHtml } from "../../lib/richText";
import type { TemplateBackgroundMedia, TemplateLayer, TemplateScene, TemplateShapeKind, TemplateTextLayer } from "../../types/templates";

export const BACKGROUND_MEDIA_ID = "__background_media__";

type LayerPatch = Partial<Omit<TemplateLayer, "type" | "id">>;
type MediaPatch = Partial<TemplateBackgroundMedia>;

interface StudioCanvasProps {
  scene: TemplateScene;
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string | null) => void;
  onLayerPatch: (layerId: string, patch: LayerPatch) => void;
  onBackgroundMediaPatch: (patch: MediaPatch) => void;
  activeShapeTool: TemplateShapeKind | null;
  textEditRequest: { layerId: string; stamp: number } | null;
  onCreateShape: (shapeKind: TemplateShapeKind, box: Box) => void;
  onShapeToolUsed: () => void;
  onTextEditingChange: (editing: boolean) => void;
  onTextEditRequestHandled: () => void;
  onTextSelectionFormatReady: (
    formatter: ((layerId: string, patch: Partial<TemplateTextLayer>) => boolean) | null,
  ) => void;
}

type Box = { x: number; y: number; width: number; height: number };

type TextOffsets = { start: number; end: number };

/** Walk only text nodes so offsets stay valid across nested formatting spans. */
function getTextOffsets(root: HTMLElement, range: Range): TextOffsets | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let charCount = 0;
  let start = -1;
  let end = -1;
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent?.length ?? 0;
    if (start === -1 && node === range.startContainer) {
      start = charCount + range.startOffset;
    }
    if (node === range.endContainer) {
      end = charCount + range.endOffset;
    }
    charCount += length;
    node = walker.nextNode();
  }
  if (start === -1 || end === -1) {
    return null;
  }
  return { start, end };
}

function createRangeFromTextOffsets(root: HTMLElement, offsets: TextOffsets): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let charCount = 0;
  let startSet = false;
  let endSet = false;
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent?.length ?? 0;
    const nodeEnd = charCount + length;
    if (!startSet && offsets.start <= nodeEnd) {
      range.setStart(node, Math.max(0, offsets.start - charCount));
      startSet = true;
    }
    if (!endSet && offsets.end <= nodeEnd) {
      range.setEnd(node, Math.max(0, offsets.end - charCount));
      endSet = true;
      break;
    }
    charCount += length;
    node = walker.nextNode();
  }
  if (!startSet || !endSet) {
    return null;
  }
  return range;
}

type DragMode =
  | { kind: "move"; targetId: string; startX: number; startY: number; originX: number; originY: number }
  | { kind: "resize"; targetId: string; handle: string; startX: number; startY: number; origin: Box }
  | { kind: "rotate"; targetId: string; centerX: number; centerY: number }
  | { kind: "draw"; shapeKind: TemplateShapeKind; startX: number; startY: number };

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;

const HANDLE_POSITION: Record<(typeof HANDLES)[number], { top: string; left: string; cursor: string }> = {
  nw: { top: "0%", left: "0%", cursor: "nwse-resize" },
  n: { top: "0%", left: "50%", cursor: "ns-resize" },
  ne: { top: "0%", left: "100%", cursor: "nesw-resize" },
  e: { top: "50%", left: "100%", cursor: "ew-resize" },
  se: { top: "100%", left: "100%", cursor: "nwse-resize" },
  s: { top: "100%", left: "50%", cursor: "ns-resize" },
  sw: { top: "100%", left: "0%", cursor: "nesw-resize" },
  w: { top: "50%", left: "0%", cursor: "ew-resize" },
};

export function StudioCanvas({
  scene,
  selectedLayerId,
  onSelectLayer,
  onLayerPatch,
  onBackgroundMediaPatch,
  activeShapeTool,
  textEditRequest,
  onCreateShape,
  onShapeToolUsed,
  onTextEditingChange,
  onTextEditRequestHandled,
  onTextSelectionFormatReady,
}: StudioCanvasProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const editInputRef = useRef<HTMLDivElement | null>(null);
  const handledEditStampRef = useRef<number | null>(null);
  const savedSelectionRef = useRef<TextOffsets | null>(null);
  const [drag, setDrag] = useState<DragMode | null>(null);
  const [guides, setGuides] = useState<{ vertical: number[]; horizontal: number[] }>({ vertical: [], horizontal: [] });
  const [drawPreview, setDrawPreview] = useState<(Box & { shapeKind: TemplateShapeKind }) | null>(null);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const editingValueRef = useRef("");
  const selectOnFocusRef = useRef(false);
  const layers = [...scene.layers].sort((a, b) => a.zIndex - b.zIndex);
  const media = scene.backgroundMedia;

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  const toPercentPoint = (clientX: number, clientY: number, rect: DOMRect) => ({
    x: clamp(((clientX - rect.left) / rect.width) * 100, 0, 100),
    y: clamp(((clientY - rect.top) / rect.height) * 100, 0, 100),
  });

  const makeDrawBox = (
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    shapeKind: TemplateShapeKind,
  ): Box => {
    let dx = endX - startX;
    let dy = endY - startY;

    if (shapeKind === "square" || shapeKind === "circle") {
      const size = Math.min(Math.abs(dx), Math.abs(dy));
      dx = Math.sign(dx || 1) * size;
      dy = Math.sign(dy || 1) * size;
    }

    const x = dx >= 0 ? startX : startX + dx;
    const y = dy >= 0 ? startY : startY + dy;
    return {
      x: clamp(x, 0, 100),
      y: clamp(y, 0, 100),
      width: clamp(Math.abs(dx), 0, 100),
      height: clamp(Math.abs(dy), 0, 100),
    };
  };

  const findBox = (targetId: string): Box | null => {
    if (targetId === BACKGROUND_MEDIA_ID) {
      return media ? { x: media.x, y: media.y, width: media.width, height: media.height } : null;
    }
    const layer = scene.layers.find((entry) => entry.id === targetId);
    return layer ? { x: layer.x, y: layer.y, width: layer.width, height: layer.height } : null;
  };

  const beginTextEdit = (layerId: string, initialContent: string, selectAll = false) => {
    setEditingLayerId(layerId);
    const nextValue = contentToEditableHtml(initialContent);
    editingValueRef.current = nextValue;
    savedSelectionRef.current = null;
    selectOnFocusRef.current = selectAll;
  };

  const cancelTextEdit = () => {
    setEditingLayerId(null);
    editingValueRef.current = "";
    savedSelectionRef.current = null;
  };

  const commitTextEdit = () => {
    if (!editingLayerId) {
      return;
    }
    onLayerPatch(editingLayerId, { content: editingValueRef.current } as LayerPatch);
    setEditingLayerId(null);
    editingValueRef.current = "";
    savedSelectionRef.current = null;
  };

  const captureSelection = useCallback(() => {
    const editor = editInputRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) {
      return;
    }
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) {
      return;
    }
    savedSelectionRef.current = getTextOffsets(editor, range);
  }, []);

  const syncEditorContent = useCallback(
    (layerId: string) => {
      const editor = editInputRef.current;
      if (!editor) {
        return;
      }
      const nextValue = sanitizeRichTextHtml(editor.innerHTML);
      if (nextValue !== editor.innerHTML) {
        editor.innerHTML = nextValue;
      }
      editingValueRef.current = nextValue;
      onLayerPatch(layerId, { content: nextValue } as LayerPatch);
    },
    [onLayerPatch],
  );

  const formatSelectedText = useCallback(
    (layerId: string, patch: Partial<TemplateTextLayer>) => {
      const editor = editInputRef.current;
      const offsets = savedSelectionRef.current;
      if (!hasInlineTextPatch(patch) || !editor || editingLayerId !== layerId || !offsets || offsets.start === offsets.end) {
        return false;
      }

      // Recompute the DOM range from character offsets on every call instead of reusing a
      // cached Range object, so a prior format's DOM edits (span wrapping / sanitize innerHTML
      // resets) never leave us formatting a stale, mismatched, or wrong part of the text.
      const workingRange = createRangeFromTextOffsets(editor, offsets);
      if (!workingRange) {
        return false;
      }

      const span = document.createElement("span");
      applyTextPatchToElement(span, patch);
      span.appendChild(workingRange.extractContents());
      workingRange.insertNode(span);

      savedSelectionRef.current = offsets;

      if (document.activeElement === editor) {
        const nextRange = document.createRange();
        nextRange.selectNodeContents(span);
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(nextRange);
        }
      }

      syncEditorContent(layerId);
      return true;
    },
    [editingLayerId, syncEditorContent],
  );


  useEffect(() => {
    onTextEditingChange(Boolean(editingLayerId));
  }, [editingLayerId, onTextEditingChange]);

  useEffect(() => {
    if (!textEditRequest) {
      return;
    }
    if (handledEditStampRef.current === textEditRequest.stamp) {
      return;
    }
    const layer = scene.layers.find((entry) => entry.id === textEditRequest.layerId);
    if (!layer || layer.type !== "text") {
      return;
    }
    handledEditStampRef.current = textEditRequest.stamp;
    const timeoutId = window.setTimeout(() => {
      beginTextEdit(layer.id, layer.content, true);
      onTextEditRequestHandled();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [onTextEditRequestHandled, scene.layers, textEditRequest]);

  useEffect(() => {
    if (!editingLayerId) {
      return;
    }
    const active = scene.layers.find((entry) => entry.id === editingLayerId);
    if (!active || active.type !== "text") {
      const timeoutId = window.setTimeout(() => {
        cancelTextEdit();
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }
  }, [editingLayerId, scene.layers]);

  useEffect(() => {
    if (!editingLayerId) {
      return;
    }
    const id = window.requestAnimationFrame(() => {
      const input = editInputRef.current;
      if (!input) {
        return;
      }
      input.innerHTML = editingValueRef.current;
      input.focus();
      if (selectOnFocusRef.current) {
        const range = document.createRange();
        range.selectNodeContents(input);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        savedSelectionRef.current = getTextOffsets(input, range);
        selectOnFocusRef.current = false;
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [editingLayerId]);

  useEffect(() => {
    onTextSelectionFormatReady(formatSelectedText);
    return () => onTextSelectionFormatReady(null);
  }, [formatSelectedText, onTextSelectionFormatReady]);

  const collectSnapTargets = (excludeId: string, includeLayerTargets: boolean) => {
    const vertical = new Set<number>([0, 50, 100]);
    const horizontal = new Set<number>([0, 50, 100]);
    const boxes: Box[] = [];
    if (media && excludeId !== BACKGROUND_MEDIA_ID) {
      boxes.push(media);
    }
    if (includeLayerTargets) {
      scene.layers.forEach((entry) => {
        if (entry.id !== excludeId) {
          boxes.push(entry);
        }
      });
    }
    boxes.forEach((box) => {
      vertical.add(box.x);
      vertical.add(box.x + box.width / 2);
      vertical.add(box.x + box.width);
      horizontal.add(box.y);
      horizontal.add(box.y + box.height / 2);
      horizontal.add(box.y + box.height);
    });
    return { vertical: [...vertical], horizontal: [...horizontal] };
  };

  const snapAxis = (current: number, offsets: number[], targets: number[], threshold: number) => {
    let guide: number | null = null;
    let bestDelta = threshold;
    let bestShift = 0;
    for (const offset of offsets) {
      const edgeValue = current + offset;
      for (const target of targets) {
        const delta = Math.abs(edgeValue - target);
        if (delta < bestDelta) {
          bestDelta = delta;
          bestShift = target - edgeValue;
          guide = target;
        }
      }
    }
    return { value: current + bestShift, guide };
  };

  const applyPatch = (targetId: string, patch: LayerPatch & MediaPatch) => {
    if (targetId === BACKGROUND_MEDIA_ID) {
      onBackgroundMediaPatch(patch);
    } else {
      onLayerPatch(targetId, patch);
    }
  };

  const beginMove = (event: ReactPointerEvent, targetId: string, box: Box, locked: boolean) => {
    if (activeShapeTool) {
      return;
    }
    if (locked) {
      return;
    }
    if (editingLayerId) {
      commitTextEdit();
    }
    event.stopPropagation();
    onSelectLayer(targetId);
    (event.target as Element).setPointerCapture(event.pointerId);
    setDrag({ kind: "move", targetId, startX: event.clientX, startY: event.clientY, originX: box.x, originY: box.y });
  };

  const beginResize = (event: ReactPointerEvent, targetId: string, box: Box, handle: string) => {
    if (editingLayerId) {
      commitTextEdit();
    }
    event.stopPropagation();
    (event.target as Element).setPointerCapture(event.pointerId);
    setDrag({ kind: "resize", targetId, handle, startX: event.clientX, startY: event.clientY, origin: box });
  };

  const beginRotate = (event: ReactPointerEvent, targetId: string, box: Box) => {
    if (editingLayerId) {
      commitTextEdit();
    }
    event.stopPropagation();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    (event.target as Element).setPointerCapture(event.pointerId);
    setDrag({
      kind: "rotate",
      targetId,
      centerX: rect.left + ((box.x + box.width / 2) / 100) * rect.width,
      centerY: rect.top + ((box.y + box.height / 2) / 100) * rect.height,
    });
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    if (!drag) {
      return;
    }
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    if (drag.kind === "draw") {
      const start = toPercentPoint(drag.startX, drag.startY, rect);
      const end = toPercentPoint(event.clientX, event.clientY, rect);
      const box = makeDrawBox(start.x, start.y, end.x, end.y, drag.shapeKind);
      setDrawPreview({ ...box, shapeKind: drag.shapeKind });
      return;
    }

    const thresholdX = (8 / rect.width) * 100;
    const thresholdY = (8 / rect.height) * 100;
    const includeLayerTargets = drag.targetId !== BACKGROUND_MEDIA_ID;
    const targets = collectSnapTargets(drag.targetId, includeLayerTargets);

    if (drag.kind === "move") {
      const deltaX = ((event.clientX - drag.startX) / rect.width) * 100;
      const deltaY = ((event.clientY - drag.startY) / rect.height) * 100;
      const box = findBox(drag.targetId);
      const width = box?.width ?? 0;
      const height = box?.height ?? 0;
      const rawX = drag.originX + deltaX;
      const rawY = drag.originY + deltaY;

      const snappedX = snapAxis(rawX, [0, width / 2, width], targets.vertical, thresholdX);
      const snappedY = snapAxis(rawY, [0, height / 2, height], targets.horizontal, thresholdY);
      const maxX = Math.max(0, 100 - width);
      const maxY = Math.max(0, 100 - height);

      applyPatch(drag.targetId, {
        x: clamp(snappedX.value, 0, maxX),
        y: clamp(snappedY.value, 0, maxY),
      });
      setGuides({
        vertical: snappedX.guide !== null ? [snappedX.guide] : [],
        horizontal: snappedY.guide !== null ? [snappedY.guide] : [],
      });
      return;
    }

    if (drag.kind === "resize") {
      const deltaX = ((event.clientX - drag.startX) / rect.width) * 100;
      const deltaY = ((event.clientY - drag.startY) / rect.height) * 100;
      const { origin, handle } = drag;
      const patch: LayerPatch & MediaPatch = {};
      const activeGuides: { vertical: number[]; horizontal: number[] } = { vertical: [], horizontal: [] };

      if (handle.includes("e")) {
        const rawRight = snapAxis(origin.x + origin.width + deltaX, [0], targets.vertical, thresholdX);
        if (rawRight.guide !== null) activeGuides.vertical.push(rawRight.guide);
        patch.width = clamp(rawRight.value - origin.x, 5, 100 - origin.x);
      }
      if (handle.includes("w")) {
        const rawLeft = snapAxis(origin.x + deltaX, [0], targets.vertical, thresholdX);
        if (rawLeft.guide !== null) activeGuides.vertical.push(rawLeft.guide);
        const nextX = clamp(rawLeft.value, 0, origin.x + origin.width - 5);
        patch.width = origin.width + (origin.x - nextX);
        patch.x = nextX;
      }
      if (handle.includes("s")) {
        const rawBottom = snapAxis(origin.y + origin.height + deltaY, [0], targets.horizontal, thresholdY);
        if (rawBottom.guide !== null) activeGuides.horizontal.push(rawBottom.guide);
        patch.height = clamp(rawBottom.value - origin.y, 5, 100 - origin.y);
      }
      if (handle.includes("n")) {
        const rawTop = snapAxis(origin.y + deltaY, [0], targets.horizontal, thresholdY);
        if (rawTop.guide !== null) activeGuides.horizontal.push(rawTop.guide);
        const nextY = clamp(rawTop.value, 0, origin.y + origin.height - 5);
        patch.height = origin.height + (origin.y - nextY);
        patch.y = nextY;
      }

      applyPatch(drag.targetId, patch);
      setGuides(activeGuides);
      return;
    }

    if (drag.kind === "rotate") {
      const angle = (Math.atan2(event.clientY - drag.centerY, event.clientX - drag.centerX) * 180) / Math.PI + 90;
      const normalized = Math.round(((angle + 180) % 360) - 180);
      applyPatch(drag.targetId, { rotation: normalized } as LayerPatch);
    }
  };

  const endDrag = useCallback(() => {
    if (drag?.kind === "draw") {
      const preview = drawPreview;
      if (preview && preview.width >= 1 && preview.height >= 1) {
        onCreateShape(preview.shapeKind, {
          x: preview.x,
          y: preview.y,
          width: preview.width,
          height: preview.height,
        });
        onShapeToolUsed();
      }
    }
    setDrawPreview(null);
    setDrag(null);
    setGuides({ vertical: [], horizontal: [] });
  }, [drag, drawPreview, onCreateShape, onShapeToolUsed]);

  useEffect(() => {
    if (!drag) {
      return;
    }
    const handlePointerEnd = () => {
      endDrag();
    };
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    return () => {
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [drag, drawPreview, endDrag]);

  const renderHandles = (targetId: string, box: Box) => (
    <>
      <div
        onPointerDown={(event) => beginRotate(event, targetId, box)}
        style={{
          position: "absolute",
          top: "-26px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "10px",
          height: "10px",
          borderRadius: "50%",
          background: "var(--color-primary)",
          cursor: "grab",
          boxShadow: "0 0 0 2px var(--bg-base)",
        }}
        title="Rotate"
      />
      <div
        style={{
          position: "absolute",
          top: "-26px",
          left: "50%",
          width: "1px",
          height: "16px",
          background: "var(--color-primary)",
          transform: "translateX(-50%)",
        }}
      />
      {HANDLES.map((handle) => {
        const pos = HANDLE_POSITION[handle];
        return (
          <div
            key={handle}
            // eslint-disable-next-line react-hooks/refs -- false positive: beginResize only reads refs inside its own event-handler body, never during render.
            onPointerDown={(event) => beginResize(event, targetId, box, handle)}
            style={{
              position: "absolute",
              top: pos.top,
              left: pos.left,
              width: "9px",
              height: "9px",
              marginTop: "-4.5px",
              marginLeft: "-4.5px",
              background: "var(--bg-base)",
              border: "1px solid var(--color-primary)",
              borderRadius: "1px",
              cursor: pos.cursor,
            }}
          />
        );
      })}
    </>
  );

  return (
    <div
      style={{
        minHeight: 0,
        height: "100%",
        display: "grid",
        placeItems: "center",
        background: "var(--bg-base)",
        padding: "24px",
        position: "relative",
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onSelectLayer(null);
        }
      }}
    >
      <div
        ref={stageRef}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) {
            if (activeShapeTool) {
              const rect = stageRef.current?.getBoundingClientRect();
              if (!rect) {
                return;
              }
              (event.target as Element).setPointerCapture(event.pointerId);
              setDrag({
                kind: "draw",
                shapeKind: activeShapeTool,
                startX: event.clientX,
                startY: event.clientY,
              });
              const start = toPercentPoint(event.clientX, event.clientY, rect);
              setDrawPreview({ x: start.x, y: start.y, width: 0, height: 0, shapeKind: activeShapeTool });
              return;
            }
            onSelectLayer(null);
          }
        }}
        style={{
          width: "min(100%, 900px)",
          aspectRatio: `${scene.canvasWidth} / ${scene.canvasHeight}`,
          borderRadius: "4px",
          position: "relative",
          overflow: "hidden",
          border: "1px solid var(--border-base)",
          background: `linear-gradient(155deg, ${scene.backgroundStart}, ${scene.backgroundEnd})`,
          boxShadow: "var(--shadow-md)",
          cursor: activeShapeTool ? "crosshair" : "default",
        }}
      >
        {media ? (
          <div
            onPointerDown={(event) => beginMove(event, BACKGROUND_MEDIA_ID, media, false)}
            style={{
              position: "absolute",
              left: `${media.x}%`,
              top: `${media.y}%`,
              width: `${media.width}%`,
              height: `${media.height}%`,
              opacity: media.opacity,
              border: selectedLayerId === BACKGROUND_MEDIA_ID ? "1px solid var(--color-primary)" : "1px dashed transparent",
              cursor: "grab",
              zIndex: 0,
            }}
            title="Background media"
          >
            <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
              {media.type === "video" ? (
                <video
                  src={media.src}
                  autoPlay
                  muted
                  loop={media.loop}
                  playsInline
                  style={{ width: "100%", height: "100%", objectFit: media.fit }}
                />
              ) : (
                <img src={media.src} alt="" style={{ width: "100%", height: "100%", objectFit: media.fit }} />
              )}
            </div>
            {selectedLayerId === BACKGROUND_MEDIA_ID ? renderHandles(BACKGROUND_MEDIA_ID, media) : null}
          </div>
        ) : null}

        {layers.map((layer) => {
          if (!layer.visible) {
            return null;
          }

          const isSelected = selectedLayerId === layer.id;
          const isEditing = editingLayerId === layer.id && layer.type === "text";

          return (
            <div
              key={layer.id}
              onPointerDown={(event) => beginMove(event, layer.id, layer, layer.locked)}
              onDoubleClick={(event) => {
                if (layer.type !== "text" || layer.locked) {
                  return;
                }
                event.stopPropagation();
                onSelectLayer(layer.id);
                beginTextEdit(layer.id, layer.content, true);
              }}
              style={{
                position: "absolute",
                left: `${layer.x}%`,
                top: `${layer.y}%`,
                width: `${layer.width}%`,
                height: `${layer.height}%`,
                opacity: layer.opacity,
                transform: `rotate(${layer.rotation}deg)`,
                transformOrigin: "center",
                border: isSelected ? "1px solid var(--color-primary)" : "1px dashed transparent",
                cursor: layer.locked ? "default" : isEditing ? "text" : "grab",
                overflow: "visible",
                borderRadius: "2px",
              }}
              title={`${layer.name}${layer.locked ? " (locked)" : ""}`}
            >
              <div style={{ width: "100%", height: "100%", overflow: "hidden", borderRadius: "2px", padding: layer.type === "text" ? "8px" : undefined }}>
                {isEditing && layer.type === "text" ? (
                  <div
                    ref={editInputRef}
                    onPointerDown={(event) => event.stopPropagation()}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={() => {
                      syncEditorContent(layer.id);
                    }}
                    onMouseUp={captureSelection}
                    onKeyUp={captureSelection}
                    onSelect={captureSelection}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        event.stopPropagation();
                        cancelTextEdit();
                        return;
                      }
                      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                        event.preventDefault();
                        event.stopPropagation();
                        commitTextEdit();
                      }
                    }}
                    style={{
                      width: "100%",
                      height: "100%",
                      border: "1px dashed var(--color-primary)",
                      outline: "none",
                      background: "rgba(0, 0, 0, 0.18)",
                      color: layer.color || "var(--fg-base)",
                      WebkitTextStrokeColor: layer.outlineColor || "transparent",
                      WebkitTextStrokeWidth: layer.outlineColor && layer.outlineWidth > 0 ? `${layer.outlineWidth}px` : "0px",
                      fontFamily: layer.fontFamily,
                      fontStyle: layer.fontStyle,
                      fontSize: `${layer.fontSize}px`,
                      fontWeight: layer.fontWeight,
                      textAlign: layer.align,
                      lineHeight: `${layer.lineHeight}`,
                      padding: "6px",
                      boxSizing: "border-box",
                      whiteSpace: "pre-wrap",
                      overflowWrap: "break-word",
                      overflow: "auto",
                      cursor: "text",
                    }}
                  />
                ) : (
                  renderLayer(layer)
                )}
              </div>

              {isSelected && !layer.locked && !isEditing ? renderHandles(layer.id, layer) : null}
            </div>
          );
        })}

        {drawPreview ? (
          <div
            style={{
              position: "absolute",
              left: `${drawPreview.x}%`,
              top: `${drawPreview.y}%`,
              width: `${drawPreview.width}%`,
              height: `${drawPreview.height}%`,
              opacity: 0.85,
              pointerEvents: "none",
              border: "1px dashed var(--color-primary)",
              boxSizing: "border-box",
            }}
          >
            {renderShapePreview(drawPreview.shapeKind)}
          </div>
        ) : null}

        {drag
          ? guides.vertical.map((position) => (
              <div
                key={`v-${position}`}
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `${position}%`,
                  width: "1px",
                  background: "var(--color-accent, #ff3d9a)",
                  boxShadow: "0 0 4px rgba(255, 61, 154, 0.6)",
                  zIndex: 50,
                  pointerEvents: "none",
                }}
              />
            ))
          : null}

        {drag
          ? guides.horizontal.map((position) => (
              <div
                key={`h-${position}`}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: `${position}%`,
                  height: "1px",
                  background: "var(--color-accent, #ff3d9a)",
                  boxShadow: "0 0 4px rgba(255, 61, 154, 0.6)",
                  zIndex: 50,
                  pointerEvents: "none",
                }}
              />
            ))
          : null}
      </div>
    </div>
  );
}

function renderLayer(layer: TemplateLayer) {
  if (layer.type === "shape") {
    const hasOutline = layer.borderWidth > 0 && Boolean(layer.borderColor);

    if (layer.shapeKind === "triangle") {
      return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
          <polygon
            points="50,2 98,98 2,98"
            fill={layer.fill || "transparent"}
            stroke={hasOutline ? layer.borderColor : "none"}
            strokeWidth={hasOutline ? Math.max(0.5, layer.borderWidth * 1.5) : 0}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      );
    }

    const borderRadius = layer.shapeKind === "circle" ? "50%" : `${layer.radius}px`;
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: layer.fill || "transparent",
          border: hasOutline ? `${layer.borderWidth}px solid ${layer.borderColor}` : "none",
          borderRadius,
        }}
      />
    );
  }

  return <AutoFitTextLayer layer={layer} />;
}

/** Renders text at layer.fontSize, then shrinks/grows it in-place to fill the box when autoFit is set. */
function AutoFitTextLayer({ layer }: { layer: TemplateTextLayer }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [fontSize, setFontSize] = useState(layer.fontSize);

  useLayoutEffect(() => {
    const mode = layer.autoFit ?? "none";
    const container = containerRef.current;
    const measure = measureRef.current;
    if (mode === "none" || !container || !measure) {
      setFontSize(layer.fontSize);
      return;
    }

    const fits = (size: number) => {
      measure.style.fontSize = `${size}px`;
      return measure.scrollHeight <= container.clientHeight + 0.5 && measure.scrollWidth <= container.clientWidth + 0.5;
    };

    let size = layer.fontSize;
    if (mode === "shrink") {
      while (size > 6 && !fits(size)) {
        size -= 1;
      }
    } else {
      while (size < 400 && fits(size + 1)) {
        size += 1;
      }
    }
    setFontSize(size);
  }, [layer.autoFit, layer.fontSize, layer.content, layer.width, layer.height, layer.lineHeight, layer.fontFamily, layer.fontWeight, layer.fontStyle]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <div
        ref={measureRef}
        style={{
          color: layer.color,
          WebkitTextStrokeColor: layer.outlineColor || "transparent",
          WebkitTextStrokeWidth: layer.outlineColor && layer.outlineWidth > 0 ? `${layer.outlineWidth}px` : "0px",
          fontFamily: layer.fontFamily,
          fontStyle: layer.fontStyle,
          fontSize: `${fontSize}px`,
          fontWeight: layer.fontWeight,
          textAlign: layer.align,
          lineHeight: layer.lineHeight,
          whiteSpace: "pre-wrap",
        }}
      >
        {renderTokenizedText(layer.content)}
      </div>
    </div>
  );
}

function renderTokenizedText(content: string) {
  if (isRichTextHtml(content)) {
    return <span dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(content) }} />;
  }

  const parts = content.split(/(\{[a-zA-Z0-9_]+\})/g);
  return parts.map((part, index) =>
    /^\{[a-zA-Z0-9_]+\}$/.test(part) ? (
      <span key={index} style={{ opacity: 0.55 }}>
        {part}
      </span>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

function applyTextPatchToElement(element: HTMLElement, patch: Partial<TemplateTextLayer>) {
  if (patch.color) element.style.color = patch.color;
  if (patch.fontFamily) element.style.fontFamily = patch.fontFamily;
  if (patch.fontSize) element.style.fontSize = `${patch.fontSize}px`;
  if (patch.fontWeight) element.style.fontWeight = `${patch.fontWeight}`;
  if (patch.fontStyle) element.style.fontStyle = patch.fontStyle;
  if (patch.lineHeight) element.style.lineHeight = `${patch.lineHeight}`;
  if (patch.outlineColor) element.style.webkitTextStrokeColor = patch.outlineColor;
  if (typeof patch.outlineWidth === "number") element.style.webkitTextStrokeWidth = `${patch.outlineWidth}px`;
}

function hasInlineTextPatch(patch: Partial<TemplateTextLayer>) {
  return (
    patch.color !== undefined ||
    patch.fontFamily !== undefined ||
    patch.fontSize !== undefined ||
    patch.fontWeight !== undefined ||
    patch.fontStyle !== undefined ||
    patch.lineHeight !== undefined ||
    patch.outlineColor !== undefined ||
    patch.outlineWidth !== undefined
  );
}

function renderShapePreview(shapeKind: TemplateShapeKind) {
  if (shapeKind === "triangle") {
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
        <polygon points="50,2 98,98 2,98" fill="rgba(255,255,255,0.2)" stroke="var(--color-primary)" strokeWidth="1.4" />
      </svg>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        border: "1px solid var(--color-primary)",
        borderRadius: shapeKind === "circle" ? "50%" : "2px",
        background: "rgba(255,255,255,0.16)",
      }}
    />
  );
}
