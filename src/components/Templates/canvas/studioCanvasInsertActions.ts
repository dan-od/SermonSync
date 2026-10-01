/** Imperative-handle actions that insert objects or attach media to shapes. */
import { FabricImage, Rect, Textbox } from "fabric";

import { configureStudioTextbox, findByStudioId, isShapeObject, nextStudioId, nextStudioName, shapeFactory } from "./studioCanvasObjects";
import { shapeMediaFallbackPreview, shapeMediaPattern, shapeMediaVideo, videoFrameSource } from "./studioShapeMedia";
import type { StudioCanvasHandle, StudioCanvasHandleRefs } from "./studioCanvasTypes";

export function createStudioCanvasInsertActions(refs: StudioCanvasHandleRefs): Pick<StudioCanvasHandle, "addText" | "addShape" | "addImage" | "setShapeMedia"> {
  const { canvasRef, documentRef, emitDocumentChangeRef, shapeMediaVideosRef } = refs;
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
  };
}
