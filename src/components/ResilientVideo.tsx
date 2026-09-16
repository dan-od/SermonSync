import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";

import type { TemplateBackgroundMedia } from "../types/templates";

const MEDIA_ERROR_MESSAGES: Record<number, string> = {
  1: "Loading was aborted.",
  2: "A network error interrupted loading.",
  3: "The video could not be decoded (unsupported codec or corrupt file).",
  4: "This video format/codec isn't supported by the system's media player.",
};

function describeMediaError(video: HTMLVideoElement): string {
  const error = video.error;
  if (!error) return "Unknown media error.";
  return MEDIA_ERROR_MESSAGES[error.code] ?? error.message ?? `Media error code ${error.code}.`;
}

function hideVideo(video: HTMLVideoElement, host: HTMLDivElement, reason: string) {
  console.error(`[ResilientVideo] background video failed to load: ${reason}`);
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

function clearFallback(host: HTMLDivElement) {
  try {
    host.querySelector("[data-resilient-video-fallback]")?.remove();
  } catch {
    // Ignore.
  }
}

function configureVideo(
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
 * WebKitGTK (Tauri's Linux webview) cannot reliably stream/seek a `<video>`
 * element whose `src` is a large base64 `data:` URI — its GStreamer-backed
 * media pipeline expects a real resource it can range-request against, and
 * ultimately throws `NotFoundError: The object can not be found here` when
 * it can't. Templates persist background video as `data:` URIs (so they
 * survive being saved to disk/localStorage without a separate file), but a
 * live `<video>` element should never be pointed at that URI directly.
 * Converting it to a `Blob` object URL first gives the media backend a
 * real, seekable resource to work with. Non-`data:` sources (e.g. a future
 * `asset://`/http URL) are already streamable and are returned as-is.
 */
function resolvePlayableSource(source: string): { src: string; objectUrl: string | null } | null {
  if (!source.startsWith("data:")) {
    return { src: source, objectUrl: null };
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

/**
 * WebKit can throw NotFoundError while a video points at a stale local-file
 * URL. React owns only the empty host; the media node and every media
 * operation are isolated behind guarded DOM calls.
 */
export function ResilientVideo({
  media,
  style,
  autoPlay = true,
  preload,
  playing = true,
  loop = media.loop !== false,
  onVideoElementChange,
}: {
  media: TemplateBackgroundMedia;
  style: CSSProperties;
  autoPlay?: boolean;
  preload?: "none" | "metadata" | "auto";
  playing?: boolean;
  loop?: boolean;
  onVideoElementChange?: (video: HTMLVideoElement | null) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const source = typeof media.src === "string" ? media.src.trim() : "";
    if (!host || !source) {
      videoRef.current = null;
      return;
    }
    clearFallback(host);

    const resolved = resolvePlayableSource(source);
    if (!resolved) {
      videoRef.current = null;
      console.error("[ResilientVideo] could not decode the background video's data: URI.");
      const fallback = document.createElement("div");
      fallback.dataset.resilientVideoFallback = "true";
      fallback.style.cssText =
        "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;" +
        "padding:16px;text-align:center;color:rgba(255,255,255,0.75);" +
        "font:12px/1.4 system-ui,sans-serif;background:rgba(20,10,30,0.55);pointer-events:none;";
      fallback.textContent = "Could not read the video file. Try re-selecting it.";
      try {
        host.appendChild(fallback);
      } catch {
        // Ignore.
      }
      return;
    }
    let objectUrl = resolved.objectUrl;

    const video = document.createElement("video");
    videoRef.current = video;
    onVideoElementChange?.(video);
    let active = true;
    let normalizationAttempted = false;
    let normalizationInProgress = false;

    const handleLoaded = () => {
      if (active) clearFallback(host);
    };

    const handleError = () => {
      if (!active) return;
      if (source.startsWith("data:") && !normalizationAttempted && !normalizationInProgress) {
        normalizationAttempted = true;
        normalizationInProgress = true;
        void invoke<string>("normalize_video_data_url", { dataUrl: source })
          .then((normalizedSource) => {
            if (!active) return;
            const normalized = resolvePlayableSource(normalizedSource);
            if (!normalized) throw new Error("The normalized video could not be read.");
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            objectUrl = normalized.objectUrl;
            video.src = normalized.src;
            video.load();
            if (autoPlay && playing) void video.play().catch(() => undefined);
          })
          .catch((error: unknown) => {
            if (active) hideVideo(video, host, error instanceof Error ? error.message : describeMediaError(video));
          })
          .finally(() => {
            normalizationInProgress = false;
          });
        return;
      }
      hideVideo(video, host, describeMediaError(video));
    };

    try {
      configureVideo(video, {
        autoPlay,
        muted: media.muted !== false,
        loop,
        preload,
        speed: media.speed ?? 1,
        objectFit: typeof style.objectFit === "string" ? style.objectFit : "cover",
      });
      video.addEventListener("error", handleError);
      video.addEventListener("loadeddata", handleLoaded);
      host.appendChild(video);
      video.src = resolved.src;
      video.load();
      if (autoPlay) void video.play().catch(() => undefined);
    } catch (error) {
      hideVideo(video, host, error instanceof Error ? error.message : String(error));
    }

    return () => {
      active = false;
      try {
        video.removeEventListener("error", handleError);
        video.removeEventListener("loadeddata", handleLoaded);
      } catch {
        // Ignore cleanup for an already-invalid media node.
      }
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {
        // WebKit may reject cleanup for an already-invalid media resource.
      }
      try {
        if (video.parentNode === host) host.removeChild(video);
      } catch {
        // The host may already have been detached by the webview.
      }
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // Ignore an already-revoked/invalid object URL.
        }
      }
      if (videoRef.current === video) videoRef.current = null;
      onVideoElementChange?.(null);
    };
    // Source changes own the media element lifecycle. Other playback options
    // are synchronized by the effect below without forcing a re-decode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.src]);

  useLayoutEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    configureVideo(video, {
      autoPlay,
      muted: media.muted !== false,
      loop,
      preload,
      speed: media.speed ?? 1,
      objectFit: typeof style.objectFit === "string" ? style.objectFit : "cover",
    });
    if (playing) {
      try {
        void video.play().catch(() => undefined);
      } catch {
        // Autoplay can be rejected synchronously by the embedded webview.
      }
    } else {
      try {
        video.pause();
      } catch {
        // WebKit may reject pausing while a media source is changing.
      }
    }
  }, [autoPlay, loop, media.muted, media.speed, onVideoElementChange, playing, preload, style.objectFit]);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", ...style }}
    />
  );
}
