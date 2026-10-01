/** Builds the StudioCanvasHandle exposed through FabricStudioCanvas's handleRef. */
import { ActiveSelection, Group, Pattern, Polygon, Textbox } from "fabric";

import type { StudioFabricObjectData } from "../../../types/studioDocument";
import { findByStudioId, isShapeObject, nextStudioId, nextStudioName, radialPoints } from "./studioCanvasObjects";
import { refreshShapeMediaPattern } from "./studioShapeMedia";
import { applyAutoSize, applyTextScript, normalizeStudioScript, scriptRange, selectionStyleSummary, selectionStylesFrom, updateScriptFontSize, type StudioAutoSize } from "./studioTextFormatting";
import { createStudioCanvasInsertActions } from "./studioCanvasInsertActions";
import type { StudioCanvasHandle, StudioCanvasHandleRefs } from "./studioCanvasTypes";

export function createStudioCanvasHandle(refs: StudioCanvasHandleRefs): StudioCanvasHandle {
  const { clipboardRef, pasteOffsetRef, canvasRef, documentRef, callbacksRef, textSelectionRef, undoRef, redoRef, emitDocumentChangeRef } = refs;
  return {
    ...createStudioCanvasInsertActions(refs),
    copySelection: async () => {
      const canvas = canvasRef.current;
      if (!canvas) return false;
      const selectedObjects = canvas.getActiveObjects();
      if (selectedObjects.length === 0 || selectedObjects.some((object) => object instanceof Textbox && object.isEditing)) return false;
      clipboardRef.current = await Promise.all(selectedObjects.map((object) => object.clone()));
      pasteOffsetRef.current = 0;
      return true;
    },
    pasteSelection: async () => {
      const canvas = canvasRef.current;
      if (!canvas || clipboardRef.current.length === 0) return false;
      const offset = 24 + pasteOffsetRef.current * 12;
      const pastedObjects = await Promise.all(clipboardRef.current.map((object) => object.clone()));
      pastedObjects.forEach((object) => {
        const sourceName = object.studioName || "Layer";
        object.set({
          left: (object.left ?? 0) + offset,
          top: (object.top ?? 0) + offset,
          studioId: nextStudioId("layer"),
          studioRole: "layer",
          studioName: `${sourceName} Copy`,
        });
        object.setCoords();
        canvas.add(object);
      });
      pasteOffsetRef.current += 1;
      canvas.discardActiveObject();
      if (pastedObjects.length === 1) canvas.setActiveObject(pastedObjects[0]);
      canvas.requestRenderAll();
      emitDocumentChangeRef.current();
      return true;
    },
    groupSelection: () => {
      const canvas = canvasRef.current;
      const activeObject = canvas?.getActiveObject();
      if (!canvas || !(activeObject instanceof ActiveSelection) || activeObject.getObjects().length < 2) return false;
      const objects = [...activeObject.getObjects()];
      canvas.discardActiveObject();
      canvas.remove(...objects);
      const group = new Group(objects, {
        studioId: nextStudioId("group"),
        studioRole: "layer",
        studioName: nextStudioName(canvas, "Group"),
      });
      canvas.add(group);
      canvas.setActiveObject(group);
      canvas.requestRenderAll();
      emitDocumentChangeRef.current();
      return true;
    },
    ungroupSelection: () => {
      const canvas = canvasRef.current;
      const activeObject = canvas?.getActiveObject();
      if (!canvas || !(activeObject instanceof Group) || activeObject instanceof ActiveSelection) return false;
      const objects = activeObject.removeAll();
      canvas.remove(activeObject);
      objects.forEach((object) => canvas.add(object));
      const selection = new ActiveSelection(objects, { canvas });
      canvas.setActiveObject(selection);
      canvas.requestRenderAll();
      emitDocumentChangeRef.current();
      return true;
    },
    deleteSelection: () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.getActiveObjects().forEach((object) => canvas.remove(object));
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      emitDocumentChangeRef.current();
    },
    selectById: (studioId) => {
      const canvas = canvasRef.current;
      const object = canvas && findByStudioId(canvas, studioId);
      if (!canvas || !object) return;
      textSelectionRef.current.clear();
      callbacksRef.current.onTextSelectionChange(null);
      canvas.setActiveObject(object);
      canvas.requestRenderAll();
    },
    setVisible: (studioId, visible) => {
      const canvas = canvasRef.current;
      const object = canvas && findByStudioId(canvas, studioId);
      if (!canvas || !object) return;
      object.set({ visible });
      canvas.requestRenderAll();
      emitDocumentChangeRef.current();
    },
    setLocked: (studioId, locked) => {
      const canvas = canvasRef.current;
      const object = canvas && findByStudioId(canvas, studioId);
      if (!canvas || !object) return;
      object.set({
        studioLocked: locked,
        selectable: !locked,
        evented: !locked,
        lockMovementX: locked,
        lockMovementY: locked,
        lockRotation: locked,
        lockScalingX: locked,
        lockScalingY: locked,
      });
      if (locked && canvas.getActiveObject() === object) canvas.discardActiveObject();
      canvas.requestRenderAll();
      emitDocumentChangeRef.current();
    },
    toDocument: () => {
      const canvas = canvasRef.current;
      const current = documentRef.current;
      if (!canvas) return current;
      const exported = canvas.toObject();
      return {
        ...current,
        background: (exported.background as string | undefined) ?? current.background,
        fabricVersion: exported.version ?? current.fabricVersion,
        objects: exported.objects as StudioFabricObjectData[],
        updatedAt: Date.now(),
      };
    },
    updateObject: (studioId, props) => {
      const canvas = canvasRef.current;
      const object = canvas && findByStudioId(canvas, studioId);
      if (!canvas || !object) return;

      const selectionStyles = object instanceof Textbox ? selectionStylesFrom(props) : {};
      const activeObject = canvas.getActiveObject();
      const rememberedSelection = textSelectionRef.current.get(studioId);
      const liveSelection = object instanceof Textbox && object.isEditing && object.selectionEnd > object.selectionStart
        ? { start: object.selectionStart, end: object.selectionEnd }
        : undefined;
      const selection = liveSelection ?? rememberedSelection;
      const hasHighlightedText = object instanceof Textbox
        && activeObject === object
        && Boolean(selection && selection.end > selection.start);
      const requestedScript = normalizeStudioScript(props.studioScript);
      const hasScriptRequest = props.studioScript === "none" || props.studioScript === "superscript" || props.studioScript === "subscript";

      if (hasHighlightedText && Object.keys(selectionStyles).length > 0) {
        object.setSelectionStyles(selectionStyles, selection!.start, selection!.end);
      }
      if (object instanceof Textbox && hasScriptRequest) {
        applyTextScript(object, requestedScript, hasHighlightedText ? selection! : scriptRange(object));
        if (!hasHighlightedText) {
          object.set({ studioScript: requestedScript });
        } else {
          const fullSelection = selection!.start === 0 && selection!.end >= object.text.length;
          object.set({ studioScript: fullSelection ? requestedScript : "none" });
        }
      }
      if (object instanceof Textbox && hasHighlightedText && "fontSize" in props) {
        updateScriptFontSize(object, selection!, Number(props.fontSize));
      }

      // Container/paragraph properties still apply to the textbox itself.
      // Character styles above are removed from this object-level update so
      // unselected characters retain their existing formatting.
      const objectProps = { ...props };
      const isShape = isShapeObject(object);
      const hasShapeMedia = isShape && object.fill instanceof Pattern;
      if (hasShapeMedia && typeof props.fill === "string") {
        object.studioShapeFillColor = props.fill;
        delete objectProps.fill;
      }
      if (hasHighlightedText) for (const key of Object.keys(selectionStyles)) {
        delete objectProps[key];
      }
      if ("backgroundColor" in props && hasHighlightedText) delete objectProps.backgroundColor;
      if (hasScriptRequest) delete objectProps.studioScript;
      if (object instanceof Textbox && !hasHighlightedText && "fontSize" in props && normalizeStudioScript(object.studioScript) !== "none") {
        updateScriptFontSize(object, scriptRange(object), Number(props.fontSize));
        delete objectProps.fontSize;
      }
      if (Object.keys(objectProps).length > 0) object.set(objectProps);
      if (isShape && hasShapeMedia && ("studioShapeFillFit" in props || "studioShapeFillScale" in props || "studioShapeFillX" in props || "studioShapeFillY" in props || "width" in props || "height" in props)) {
        refreshShapeMediaPattern(object);
      }
      if (object instanceof Polygon && (object.studioShapeKind === "polygon" || object.studioShapeKind === "star")) {
        const width = Math.max(10, object.width * object.scaleX);
        const height = Math.max(10, object.height * object.scaleY);
        if (object.studioShapeKind === "polygon" && "polygonSides" in props) {
          const polygonSides = Math.max(3, Math.min(12, Number(props.polygonSides) || 3));
          object.set({ polygonSides, points: radialPoints(polygonSides, Math.min(width, height) / 2) });
        }
        if (object.studioShapeKind === "star" && ("starPoints" in props || "starInnerRadius" in props)) {
          const starPoints = Math.max(3, Math.min(10, Number(props.starPoints ?? object.starPoints) || 5));
          const starInnerRadius = Math.max(0.08, Math.min(0.92, Number(props.starInnerRadius ?? object.starInnerRadius) || 0.44));
          object.set({ starPoints, starInnerRadius, points: radialPoints(starPoints * 2, Math.min(width, height) / 2, Math.min(width, height) * starInnerRadius / 2) });
        }
      }
      if (object instanceof Textbox && "autoSize" in props) {
        const requestedMode = props.autoSize;
        const mode: StudioAutoSize = requestedMode === "Grow to fit" || requestedMode === "Shrink to fit" ? requestedMode : "None";
        applyAutoSize(object, mode, hasHighlightedText ? selection! : { start: 0, end: object.text.length });
      }
      object.setCoords();
      canvas.requestRenderAll();
      if (hasHighlightedText && object instanceof Textbox) {
        callbacksRef.current.onTextSelectionChange({
          studioId,
          ...selection!,
          styles: selectionStyleSummary(object, selection!.start, selection!.end),
        });
      }
      emitDocumentChangeRef.current();
    },
    reorderObject: (studioId, direction) => {
      const canvas = canvasRef.current;
      const object = canvas && findByStudioId(canvas, studioId);
      if (!canvas || !object) return;
      if (direction === "front") canvas.bringObjectToFront(object);
      if (direction === "forward") canvas.bringObjectForward(object);
      if (direction === "backward") canvas.sendObjectBackwards(object);
      if (direction === "back") canvas.sendObjectToBack(object);
      canvas.requestRenderAll();
      emitDocumentChangeRef.current();
    },
    getCanvas: () => canvasRef.current,
    undo: () => undoRef.current(),
    redo: () => redoRef.current(),
    setBackground: (background) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.backgroundColor = background;
      canvas.requestRenderAll();
      emitDocumentChangeRef.current();
    },
    setBackgroundConfig: (config) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const background = config.mode === "color" ? (config.color ?? "") : "";
      canvas.backgroundColor = background;
      canvas.requestRenderAll();
      callbacksRef.current.onDocumentChange({
        background,
        backgroundMode: config.mode,
        backgroundColor: config.color,
        backgroundGradientStart: config.gradientStart,
        backgroundGradientEnd: config.gradientEnd,
        backgroundGradientAngle: config.gradientAngle,
        backgroundGradientStyle: config.gradientStyle,
        backgroundBlur: config.backgroundBlur,
        backgroundMedia: config.media,
        updatedAt: Date.now(),
      });
    },
  };
}
