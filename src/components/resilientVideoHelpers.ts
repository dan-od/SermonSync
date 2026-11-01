import { convertFileSrc } from "@tauri-apps/api/core";
import { preparedTemplateVideoUrl } from "../lib/templateVideoWarmup";
import { managedVideoUrl } from "../lib/videoImport";

const MEDIA_ERROR_MESSAGES: Record<number, string> = {
  1: "Loading was aborted.",
  2: "A network error interrupted loading.",
  3: "The video could not be decoded (unsupported codec or corrupt file).",
  4: "This video format/codec isn't supported by the system's media player.",
};

export function describeMediaError(video: HTMLVideoElement): string {
  const error = video.error;
  if (!error) return "Unknown media error.";
  return MEDIA_ERROR_MESSAGES[error.code] ?? error.message ?? `Media error code ${error.code}.`;
}

export function hideVideo(video: HTMLVideoElement, host: HTMLDivElement, reason: string) {
  console.error(`[ResilientVideo] background video failed to load: ${reason}`);
  host.querySelector("[data-resilient-video-status]")?.remove();
  try {
    video.style.display = "none";
  } catch {
    // Ignore a WebKit media node that has already become invalid.
  }
  try {
    let fallback = host.querySelector<HTMLDivElement>("[data-resilient-video-fallback]");
    if (!fallback) {
      fallback = document.createElement("div");
      fallback.dataset.resilientVideoFallback = "true";
      fallback.style.cssText =
        "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;" +
        "padding:16px;text-align:center;color:rgba(255,255,255,0.75);" +
        "font:12px/1.4 system-ui,sans-serif;background:rgba(20,10,30,0.55);pointer-events:none;";
      host.appendChild(fallback);
    }
    fallback.textContent = reason;
  } catch {
    // Ignore — this fallback message is purely cosmetic.
  }
}

export function showVideoStatus(host: HTMLDivElement, message: string) {
  let status = host.querySelector<HTMLDivElement>("[data-resilient-video-status]");
  if (!status) {
    status = document.createElement("div");
    status.dataset.resilientVideoStatus = "true";
    status.style.cssText =
      "position:absolute;left:16px;right:16px;bottom:16px;z-index:2;" +
      "padding:9px 12px;border-radius:6px;background:rgba(10,10,18,.78);" +
      "color:#fff;font:12px/1.4 system-ui,sans-serif;pointer-events:none;";
    host.appendChild(status);
  }
  status.textContent = message;
}

export function clearFallback(host: HTMLDivElement) {
  try {
    host.querySelector("[data-resilient-video-fallback]")?.remove();
    host.querySelector("[data-resilient-video-status]")?.remove();
  } catch {
    // Ignore.
  }
}

const inFlightVideoBlobs = new Map<string, Promise<Blob>>();

export function fetchPlaybackBlob(src: string): Promise<Blob> {
  const existing = inFlightVideoBlobs.get(src);
  if (existing) return existing;
  const request = fetch(src).then((response) => {
    if (!response.ok) throw new Error(`Video request failed (${response.status}).`);
    const size = Number(response.headers?.get("content-length") ?? 0);
    if (size > 128 * 1024 * 1024) {
      void response.body?.cancel();
      throw new Error("This video could not be played from the local stream and is too large for the playback fallback.");
    }
    return response.blob();
  });
  inFlightVideoBlobs.set(src, request);
  void request.finally(() => inFlightVideoBlobs.delete(src)).catch(() => undefined);
  return request;
}

export function configureVideo(
  video: HTMLVideoElement,
  options: {
    autoPlay: boolean;
    muted: boolean;
    loop: boolean;
    preload?: "none" | "metadata" | "auto";
    speed: number;
    objectFit: string;
  },
) {
  try {
    video.autoplay = options.autoPlay;
    video.muted = options.muted;
    video.loop = options.loop;
    video.playsInline = true;
    if (options.preload) video.preload = options.preload;
    video.playbackRate = options.speed;
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.objectFit = options.objectFit;
  } catch {
    // WebKit can reject a property on a media node while its source changes.
  }
}

/**
 * Decodes a `data:` URI into a `Blob`, without `fetch()`.
 *
 * `fetch()` against a `data:` URI is unreliable in Tauri's Linux webview
 * (WebKitGTK) — it can silently fail there, which previously caused every
 * video background to be hidden. Decoding the base64 payload ourselves via
 * `atob` is a plain, synchronous, dependency-free operation that works
 * identically in every JS engine, so it doesn't depend on the host's
 * `fetch` implementation at all.
 */
function dataUriToBlob(dataUri: string): Blob | null {
  const commaIndex = dataUri.indexOf(",");
  if (commaIndex === -1) return null;
  const header = dataUri.slice("data:".length, commaIndex);
  const isBase64 = /;base64$/i.test(header);
  const mime = header.replace(/;base64$/i, "").split(";")[0] || "application/octet-stream";
  const data = dataUri.slice(commaIndex + 1);
  try {
    if (isBase64) {
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(data)], { type: mime });
  } catch {
    return null;
  }
}

/**
 * Resolves a `data:` URI to a `Blob` object URL.
 *
 * Legacy data URLs still use a Blob object URL, which WebKit can seek.
 * Prepared template backgrounds use a cached file streamed over loopback
 * HTTP. The webview's asset protocol does not support video playback reliably.
 */
export function resolvePlayableSource(source: string): { src: string; objectUrl: string | null } | null {
  if (!source.startsWith("data:")) {
    const preparedUrl = managedVideoUrl(source) ?? preparedTemplateVideoUrl(source);
    if (preparedUrl) return { src: preparedUrl, objectUrl: null };
    const isLocalPath = source.startsWith("/") || /^[A-Za-z]:[\\/]/.test(source);
    return { src: isLocalPath ? convertFileSrc(source) : source, objectUrl: null };
  }
  const blob = dataUriToBlob(source);
  if (!blob) return null;
  try {
    const objectUrl = URL.createObjectURL(blob);
    return { src: objectUrl, objectUrl };
  } catch {
    return null;
  }
}
