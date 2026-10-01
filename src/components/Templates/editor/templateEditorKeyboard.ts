/** Keyboard handling for the template editor modal (Escape, undo/redo, clipboard, grouping, delete). */
import type { RefObject } from "react";
import { Textbox } from "fabric";

import { isShortcutEvent, type ShortcutAction } from "../../../stores/shortcutStore";
import type { StudioCanvasHandle } from "../FabricStudioCanvas";

export interface TemplateEditorKeyContext {
  isTitlePromptOpen: boolean;
  setIsTitlePromptOpen: (open: boolean) => void;
  selectedIds: string[];
  onClose: () => void;
  shortcuts: Record<ShortcutAction, string>;
  canvasHandleRef: RefObject<StudioCanvasHandle | null>;
}

export function handleTemplateEditorKeyDown(event: KeyboardEvent, context: TemplateEditorKeyContext): void {
  const { isTitlePromptOpen, setIsTitlePromptOpen, selectedIds, onClose, shortcuts, canvasHandleRef } = context;
  const target = event.target as HTMLElement | null;
  const isTextEditing = target?.tagName === "TEXTAREA" || target?.isContentEditable;
  const isFormEditing = isTextEditing || target?.tagName === "INPUT" || target?.tagName === "SELECT" || target?.tagName === "BUTTON";
  if (event.key === "Escape") {
    if (isTitlePromptOpen) {
      setIsTitlePromptOpen(false);
      return;
    }
    if (isTextEditing) return;
    if (selectedIds.length > 0) {
      canvasHandleRef.current?.getCanvas()?.discardActiveObject();
      canvasHandleRef.current?.getCanvas()?.requestRenderAll();
      return;
    }
    onClose();
    return;
  }
  if (!isFormEditing && isShortcutEvent(event, shortcuts["template-undo"])) {
    event.preventDefault();
    void canvasHandleRef.current?.undo();
    return;
  }
  const canvas = canvasHandleRef.current?.getCanvas();
  const activeCanvasObject = canvas?.getActiveObject();
  const isCanvasTextEditing = activeCanvasObject instanceof Textbox && activeCanvasObject.isEditing;
  if (!isFormEditing && !isCanvasTextEditing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
    event.preventDefault();
    void canvasHandleRef.current?.copySelection();
    return;
  }
  if (!isFormEditing && !isCanvasTextEditing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
    event.preventDefault();
    void canvasHandleRef.current?.pasteSelection();
    return;
  }
  if (!isFormEditing && !isCanvasTextEditing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "g") {
    event.preventDefault();
    canvasHandleRef.current?.groupSelection();
    return;
  }
  if (!isFormEditing && !isCanvasTextEditing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "u") {
    event.preventDefault();
    canvasHandleRef.current?.ungroupSelection();
    return;
  }
  if (!isFormEditing && isShortcutEvent(event, shortcuts["template-redo"])) {
    event.preventDefault();
    void canvasHandleRef.current?.redo();
    return;
  }
  if (event.key === "Delete" && !isFormEditing && selectedIds.length > 0) {
    event.preventDefault();
    canvasHandleRef.current?.deleteSelection();
  }
}
