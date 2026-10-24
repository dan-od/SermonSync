import { Canvas, FabricImage, FabricObject, Pattern } from "fabric";
import { managedVideoUrl } from "../../../lib/videoImport";

type ShapeFillFit = "cover" | "contain" | "tile";

export function isShapeObject(object: FabricObject): boolean {
  return ["rectangle", "square", "circle", "triangle", "line", "arrow", "polygon", "star"].includes(String(object.studioShapeKind))
    || ["rect", "ellipse", "triangle", "line", "polygon"].includes(String(object.type).toLowerCase());
}

function sourceDimensions(source: CanvasImageSource): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth || source.width, height: source.naturalHeight || source.height };
  }
  if (source instanceof HTMLVideoElement) {
    return { width: source.videoWidth || source.width, height: source.videoHeight || source.height };
  }
  const drawable = source as CanvasImageSource & { width?: number; height?: number };
  return { width: drawable.width ?? 1, height: drawable.height ?? 1 };
}

function dataUriToBlob(dataUri: string): Blob | null {
  const commaIndex = dataUri.indexOf(",");
  if (commaIndex < 0) return null;
  const header = dataUri.slice(5, commaIndex);
  const payload = dataUri.slice(commaIndex + 1);
  const mime = header.replace(/;base64$/i, "").split(";")[0] || "video/mp4";
  try {
    if (/;base64$/i.test(header)) {
      const binary = atob(payload);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(payload)], { type: mime });
  } catch {
    return null;
  }
}

export async function videoFrameSource(source: string): Promise<string | null> {
  const video = document.createElement("video");
  video.muted = true;
  video.crossOrigin = "anonymous";
  video.playsInline = true;
  video.preload = "auto";
  const objectUrl = source.startsWith("data:") ? (() => {
    const blob = dataUriToBlob(source);
    return blob ? URL.createObjectURL(blob) : null;
  })() : null;
  try {
    video.src = objectUrl ?? managedVideoUrl(source) ?? source;
    // Some codecs never fire "loadeddata" or "error" in this webview (they just
    // stall), which would otherwise hang this await forever with nothing to catch.
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out loading the video.")), 4000);
      const settle = (run: () => void) => { clearTimeout(timer); run(); };
      video.addEventListener("loadeddata", () => settle(resolve), { once: true });
      video.addEventListener("error", () => settle(() => reject(new Error("The video could not be loaded."))), { once: true });
      video.load();
    });
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1;
    canvas.height = video.videoHeight || 1;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch {
    // Some codecs cannot be decoded by the editor webview even though the
    // projector's resilient video path can normalize and play them. Keep the
    // original source and use a neutral editor preview in that case.
    return null;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

export function shapeMediaFallbackPreview(color: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

export function shapeMediaPattern(object: FabricObject, source: CanvasImageSource, fit: ShapeFillFit, scalePercent: number, offsetXPercent: number, offsetYPercent: number): Pattern {
  const sourceSize = sourceDimensions(source);
  const shapeWidth = Math.max(1, object.width);
  const shapeHeight = Math.max(1, object.height);
  const sourceWidth = Math.max(1, sourceSize.width);
  const sourceHeight = Math.max(1, sourceSize.height);
  const fitScale = fit === "tile" ? 1 : fit === "contain"
    ? Math.min(shapeWidth / sourceWidth, shapeHeight / sourceHeight)
    : Math.max(shapeWidth / sourceWidth, shapeHeight / sourceHeight);
  const scale = fitScale * Math.max(0.1, scalePercent / 100);
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  const offsetX = (shapeWidth - renderedWidth) / 2 + (offsetXPercent / 100) * shapeWidth;
  const offsetY = (shapeHeight - renderedHeight) / 2 + (offsetYPercent / 100) * shapeHeight;

  return new Pattern({
    source,
    repeat: fit === "tile" ? "repeat" : "no-repeat",
    patternTransform: [scale, 0, 0, scale, offsetX, offsetY],
  });
}

export function refreshShapeMediaPattern(object: FabricObject): void {
  if (!isShapeObject(object) || !(object.fill instanceof Pattern)) return;
  object.set("fill", shapeMediaPattern(
    object,
    object.fill.source,
    object.studioShapeFillFit ?? "cover",
    object.studioShapeFillScale ?? 100,
    object.studioShapeFillX ?? 0,
    object.studioShapeFillY ?? 0,
  ));
}

export function shapeMediaVideo(source: string): HTMLVideoElement {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.src = managedVideoUrl(source) ?? source;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.autoplay = true;
  video.preload = "auto";
  return video;
}

function attachShapeMediaVideo(canvas: Canvas, object: FabricObject, source: string, videos: Map<string, HTMLVideoElement>, onReady: () => void) {
  if (!object.studioId) return;
  const video = shapeMediaVideo(source);
  videos.set(object.studioId, video);
  video.addEventListener("loadeddata", () => {
    if (!isShapeObject(object)) return;
    object.set("fill", shapeMediaPattern(object, video, object.studioShapeFillFit ?? "cover", object.studioShapeFillScale ?? 100, object.studioShapeFillX ?? 0, object.studioShapeFillY ?? 0));
    void video.play().catch(() => undefined);
    canvas.requestRenderAll();
    onReady();
  }, { once: true });
  video.addEventListener("timeupdate", () => canvas.requestRenderAll());
  video.load();
}

async function attachShapeMediaImage(canvas: Canvas, object: FabricObject, source: string): Promise<void> {
  try {
    const image = await FabricImage.fromURL(source);
    if (!isShapeObject(object) || !canvas.getObjects().includes(object)) return;
    object.set("fill", shapeMediaPattern(
      object,
      image.getElement(),
      object.studioShapeFillFit ?? "cover",
      object.studioShapeFillScale ?? 100,
      object.studioShapeFillX ?? 0,
      object.studioShapeFillY ?? 0,
    ));
    canvas.requestRenderAll();
  } catch {
    // The compact placeholder remains visible when a persisted image cannot
    // be decoded. The source metadata is kept so it can be retried later.
  }
}

export async function hydrateShapeMedia(canvas: Canvas, videos: Map<string, HTMLVideoElement>, onReady: () => void): Promise<void> {
  await Promise.all(canvas.getObjects().map(async (object) => {
    const source = object.studioShapeFillMediaSource;
    if (typeof source !== "string" || !source) return;
    if (object.studioShapeFillMediaType === "video") {
      attachShapeMediaVideo(canvas, object, source, videos, onReady);
      return;
    }
    await attachShapeMediaImage(canvas, object, source);
    onReady();
  }));
}
