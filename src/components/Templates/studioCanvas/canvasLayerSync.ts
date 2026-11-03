import { ActiveSelection, FabricImage, Group, Pattern, Polygon, Rect, Textbox } from "fabric";
import { isShapeObject, videoFrameSource, shapeMediaFallbackPreview, shapeMediaPattern, refreshShapeMediaPattern, shapeMediaVideo } from "./shapeMedia";
import { radialPoints, shapeFactory } from "./shapes";
import { canvasSnapshot, snapshotsEqual, nextStudioId, nextStudioName, findByStudioId } from "./snapshot";
import { type StudioAutoSize, applyAutoSize, applyTextCase, applyTextScript, configureStudioTextbox, normalizeStudioScript, normalizeStudioTextCase, scriptRange, selectionStyleSummary, selectionStylesFrom, updateScriptFontSize } from "./textbox";
import type { StudioCanvasHandle, StudioCanvasRefs } from "./types";

/** The imperative handle that applies toolbar and inspector edits to Fabric objects. */
export function createStudioCanvasHandle({ clipboardRef, pasteOffsetRef, canvasRef, documentRef, callbacksRef, textSelectionRef, historyPastRef, historyFutureRef, lastSnapshotRef, undoRef, redoRef, emitDocumentChangeRef, shapeMediaVideosRef }: Omit<StudioCanvasRefs, "restoringHistoryRef" | "historyOperationRef" | "mediaEditTargetRef" | "mediaResizeStartRef">): StudioCanvasHandle {
  return {
    addText: (box) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const textbox = new Textbox("Type here", {
        left: box.x,
        top: box.y,
        width: Math.max(40, box.width),
        centeredScaling: false,
      });
      configureStudioTextbox(textbox, box.height);
      textbox.studioId = nextStudioId("text");
      textbox.studioRole = "layer";
      textbox.studioName = nextStudioName(canvas, "Text");
      canvas.add(textbox);
      canvas.setActiveObject(textbox);
      canvas.requestRenderAll();
      emitDocumentChangeRef.current();
    },
    addShape: (kind, box) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const shape = shapeFactory(kind, Math.max(10, box.width), Math.max(10, box.height));
      shape.set({ left: box.x, top: box.y });
      shape.studioId = nextStudioId("shape");
      shape.studioRole = "layer";
      shape.studioName = nextStudioName(canvas, kind[0].toUpperCase() + kind.slice(1));
      canvas.add(shape);
      canvas.setActiveObject(shape);
      canvas.requestRenderAll();
      emitDocumentChangeRef.current();
    },
    addImage: async (source, name = "Image", mediaType = "image") => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const previewSource = mediaType === "video" ? await videoFrameSource(source) : source;
      let image: FabricImage;
      try {
        // Sources here are always local (data: URIs from the file picker or a
        // captured video frame) — requesting anonymous CORS on them serves no
        // purpose and can taint the image in stricter webviews, breaking later
        // canvas.toObject() serialization used to sync state back to React.
        image = previewSource
          ? await FabricImage.fromURL(previewSource)
          : new FabricImage(shapeMediaFallbackPreview("#101319"));
      } catch (error) {
        if (mediaType !== "video") throw error;
        image = new FabricImage(shapeMediaFallbackPreview("#101319"));
      }
      if (!canvasRef.current) return;
      const maxWidth = documentRef.current.width * 0.6;
      const maxHeight = documentRef.current.height * 0.6;
      const naturalWidth = image.width || maxWidth;
      const naturalHeight = image.height || maxHeight;
      const scale = Math.min(1, maxWidth / naturalWidth, maxHeight / naturalHeight);
      const width = Math.max(10, naturalWidth * scale);
      const height = Math.max(10, naturalHeight * scale);
      // Media add-ons are rectangles with an image-pattern fill, not bare Fabric images —
      // this gives them the same transform/fill/stroke/shadow settings as any other shape.
      const shape = new Rect({
        left: (documentRef.current.width - width) / 2,
        top: (documentRef.current.height - height) / 2,
        width,
        height,
        fill: "#101319",
        stroke: "",
        strokeWidth: 0,
        rx: 0,
        ry: 0,
      });
      shape.studioShapeKind = "rectangle";
      shape.set({
        fill: shapeMediaPattern(shape, image.getElement(), "cover", 100, 0, 0),
        studioShapeFillFit: "cover",
        studioShapeFillScale: 100,
        studioShapeFillX: 0,
        studioShapeFillY: 0,
        studioShapeFillOpacity: 1,
        studioShapeFillMediaType: mediaType,
        studioShapeFillMediaSource: source,
        studioIsMediaAddon: true,
        studioId: nextStudioId("image"),
        studioRole: "layer",
        studioName: nextStudioName(canvas, name),
      });
      canvas.add(shape);
      canvas.setActiveObject(shape);
      canvas.requestRenderAll();
      emitDocumentChangeRef.current();
    },
    setShapeMedia: async (studioId, source, name = "Shape media", mediaType = "image") => {
      const canvas = canvasRef.current;
      const object = canvas && findByStudioId(canvas, studioId);
      if (!canvas || !object || !isShapeObject(object)) return;

      if (!source) {
        const existingVideo = shapeMediaVideosRef.current.get(studioId);
        existingVideo?.pause();
        existingVideo?.removeAttribute("src");
        shapeMediaVideosRef.current.delete(studioId);
        const fallback = object.studioShapeFillColor ?? (typeof object.fill === "string" ? object.fill : "#101319");
        object.set({
          fill: fallback,
          studioShapeFillFit: undefined,
          studioShapeFillScale: undefined,
          studioShapeFillX: undefined,
          studioShapeFillY: undefined,
          studioShapeFillOpacity: undefined,
          studioShapeFillMediaType: undefined,
          studioShapeFillMediaSource: undefined,
        });
        canvas.requestRenderAll();
        emitDocumentChangeRef.current();
        return;
      }

      const fallbackColor = typeof object.fill === "string" ? object.fill : object.studioShapeFillColor ?? "#101319";
      // Apply the fill metadata and a neutral placeholder immediately, synchronously, so the
      // inspector panel reflects "media attached" right away regardless of whether the actual
      // image/video frame can be decoded — decoding failures (bad codec, slow load, etc.) must
      // never block the settings state, only the visual preview.
      object.set({
        fill: shapeMediaPattern(object, shapeMediaFallbackPreview(fallbackColor), "cover", 100, 0, 0),
        studioShapeFillFit: "cover",
        studioShapeFillScale: 100,
        studioShapeFillX: 0,
        studioShapeFillY: 0,
        studioShapeFillOpacity: 1,
        studioShapeFillColor: fallbackColor,
        studioShapeFillMediaType: mediaType,
        studioShapeFillMediaSource: source,
        studioName: object.studioName || name,
      });
      canvas.setActiveObject(object);
      canvas.requestRenderAll();
      emitDocumentChangeRef.current();

      try {
        if (mediaType === "video") {
          const video = shapeMediaVideo(source);
          const previousVideo = shapeMediaVideosRef.current.get(studioId);
          previousVideo?.pause();
          shapeMediaVideosRef.current.set(studioId, video);
          video.addEventListener("loadeddata", () => {
            if (!canvasRef.current || canvasRef.current !== canvas || !isShapeObject(object)) return;
            object.set("fill", shapeMediaPattern(
              object,
              video,
              object.studioShapeFillFit ?? "cover",
              object.studioShapeFillScale ?? 100,
              object.studioShapeFillX ?? 0,
              object.studioShapeFillY ?? 0,
            ));
            void video.play().catch(() => undefined);
            canvas.requestRenderAll();
            emitDocumentChangeRef.current();
          }, { once: true });
          video.addEventListener("timeupdate", () => canvas.requestRenderAll());
          video.load();
        } else {
          const image = await FabricImage.fromURL(source);
          if (!canvasRef.current || canvasRef.current !== canvas || !isShapeObject(object)) return;
          object.set("fill", shapeMediaPattern(
            object,
            image.getElement(),
            object.studioShapeFillFit ?? "cover",
            object.studioShapeFillScale ?? 100,
            object.studioShapeFillX ?? 0,
            object.studioShapeFillY ?? 0,
          ));
          canvas.requestRenderAll();
          emitDocumentChangeRef.current();
        }
      } catch (error) {
        // Keep the neutral placeholder already applied above; the fill metadata still stands.
        console.error("Failed to render a media preview for the shape fill", error);
      }
    },
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
      // Edits are serialized into lastSnapshotRef whenever Fabric changes.
      // Reusing that snapshot avoids a second full Pattern/source traversal
      // when Save is clicked, which was the visible pause in the studio.
      const snapshot = lastSnapshotRef.current ?? canvasSnapshot(canvas, current);
      return {
        ...current,
        // Background controls are kept in the React document patch; using
        // that value preserves a color change made immediately before Save.
        background: current.background,
        objects: snapshot.objects,
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
      const requestedTextCase = normalizeStudioTextCase(props.studioTextCase);
      const hasTextCaseRequest = object instanceof Textbox && "studioTextCase" in props;

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
      if (object instanceof Textbox && hasTextCaseRequest) {
        const range = hasHighlightedText ? selection! : scriptRange(object);
        const start = Math.max(0, Math.min(range.start, object.text.length));
        const end = Math.max(start, Math.min(range.end, object.text.length));
        const transformed = applyTextCase(object.text.slice(start, end), requestedTextCase);
        object.set({
          text: `${object.text.slice(0, start)}${transformed}${object.text.slice(end)}`,
          studioTextCase: requestedTextCase,
        });
        if (object.isEditing) {
          object.selectionStart = start;
          object.selectionEnd = start + transformed.length;
        }
        object.initDimensions();
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
      if (hasTextCaseRequest) delete objectProps.studioTextCase;
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
      const previous = lastSnapshotRef.current;
      const next = previous && { ...previous, background, backgroundMode: config.mode, backgroundMedia: config.media ?? null };
      if (previous && next && !snapshotsEqual(previous, next)) {
        historyPastRef.current.push(previous);
        historyFutureRef.current = [];
        callbacksRef.current.onHistoryChange({ canUndo: true, canRedo: false });
      }
      if (next) lastSnapshotRef.current = next;
      documentRef.current = { ...documentRef.current, background, backgroundMode: config.mode, backgroundMedia: config.media ?? null };
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
    setCameraMedia: (cameraMedia) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const previous = lastSnapshotRef.current ?? canvasSnapshot(canvas, documentRef.current);
      const next = { ...previous, cameraMedia };
      if (!snapshotsEqual(previous, next)) {
        historyPastRef.current.push(previous);
        historyFutureRef.current = [];
        callbacksRef.current.onHistoryChange({ canUndo: true, canRedo: false });
      }
      lastSnapshotRef.current = next;
      documentRef.current = { ...documentRef.current, cameraMedia };
      callbacksRef.current.onDocumentChange({ cameraMedia, updatedAt: Date.now() });
    },
  };
}
