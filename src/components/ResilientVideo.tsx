import { useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

import type { TemplateBackgroundMedia } from "../types/templates";
import { isStagedTemplateVideo } from "../lib/templateVideo";
import { preparedTemplateVideoUrl, returnWarmTemplateVideo, takeWarmTemplateVideo } from "../lib/templateVideoWarmup";
import { importVideo, managedVideoUrl, isManagedVideo } from "../lib/videoImport";

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

function showVideoStatus(host: HTMLDivElement, message: string) {
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

function clearFallback(host: HTMLDivElement) {
  try {
    host.querySelector("[data-resilient-video-fallback]")?.remove();
    host.querySelector("[data-resilient-video-status]")?.remove();
  } catch {
    // Ignore.
  }
}

const inFlightVideoBlobs = new Map<string, Promise<Blob>>();

function fetchPlaybackBlob(src: string): Promise<Blob> {
  const existing = inFlightVideoBlobs.get(src);
  if (existing) return existing;
  const request = fetch(src).then((response) => {
    if (!response.ok) throw new Error(`Video request failed (${response.status}).`);
    const size = Number(response.headers?.get("content-length") ?? 0);
    if (size > 32 * 1024 * 1024) {
      void response.body?.cancel();
      throw new Error("This video could not be played from the local stream and is too large for the playback fallback.");
    }
    return response.blob();
  });
  inFlightVideoBlobs.set(src, request);
  void request.finally(() => inFlightVideoBlobs.delete(src)).catch(() => undefined);
  return request;
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
 * Legacy data URLs still use a Blob object URL, which WebKit can seek.
 * Prepared template backgrounds use a cached file streamed over loopback
 * HTTP. The webview's asset protocol does not support video playback reliably.
 */
function resolvePlayableSource(source: string): { src: string; objectUrl: string | null } | null {
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
  sourcePath,
  onVideoElementChange,
  onReady,
  onFailure,
  presentationVisible = true,
}: {
  media: TemplateBackgroundMedia;
  style: CSSProperties;
  autoPlay?: boolean;
  preload?: "none" | "metadata" | "auto";
  playing?: boolean;
  loop?: boolean;
  sourcePath?: string;
  onVideoElementChange?: (video: HTMLVideoElement | null, removedVideo?: HTMLVideoElement) => void;
  onReady?: () => void;
  onFailure?: () => void;
  /** A prepared scene stays hidden until its background has a frame; start playback once it is on screen. */
  presentationVisible?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playingRef = useRef(playing);
  const visibleRef = useRef(presentationVisible);
  const onReadyRef = useRef(onReady);
  const onFailureRef = useRef(onFailure);
  useLayoutEffect(() => { onReadyRef.current = onReady; }, [onReady]);
  useLayoutEffect(() => { onFailureRef.current = onFailure; }, [onFailure]);
  useLayoutEffect(() => { visibleRef.current = presentationVisible; }, [presentationVisible]);

  // Decode/attach the source after the current paint. Large persisted data URLs
  // can otherwise block the projection UI during the layout phase.
  useEffect(() => {
    const host = hostRef.current;
    const source = typeof media.src === "string" ? media.src.trim() : "";
    if (!host || !source) {
      videoRef.current = null;
      return;
    }
    clearFallback(host);
    if (isStagedTemplateVideo(source)) {
      videoRef.current = null;
      showVideoStatus(host, "Preparing background video. Playback will start when ready.");
      return;
    }

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
      onFailureRef.current?.();
      return;
    }
    let objectUrl = resolved.objectUrl;

    const warmedVideo = takeWarmTemplateVideo(resolved.src);
    const video = warmedVideo ?? document.createElement("video");
    videoRef.current = video;
    onVideoElementChange?.(video);
    let active = true;
    let normalizationAttempted = false;
    let normalizationInProgress = false;
    let usingNormalizedSource = false;
    let normalizationTimer: number | null = null;
    let playbackTimer: number | null = null;
    let stallTimer: number | null = null;
    let pauseRetryTimer: number | null = null;
    let pauseRetries = 0;
    let lastPlaybackTime = 0;
    let blobFallbackAttempted = false;
    let blobFallbackInProgress = false;
    let usingBlobFallback = false;
    let observedPlaybackTime = 0;
    let stalledChecks = 0;
    const failVideo = (reason: string) => {
      hideVideo(video, host, reason);
      onFailureRef.current?.();
    };

    const requestPlayback = () => {
      if (!active || !playingRef.current || !visibleRef.current) return;
      try {
        void video.play().catch((error: unknown) => {
          if (active) console.warn("[ResilientVideo] playback was delayed", error);
        });
      } catch (error) {
        if (active) console.warn("[ResilientVideo] playback was delayed", error);
      }
    };

    const recoverCachedVideo = (force = false) => {
      if (!active || blobFallbackAttempted || !resolved.src.startsWith("http://127.0.0.1:8000/api/template-video/")) return;
      blobFallbackAttempted = true;
      blobFallbackInProgress = true;
      const recoveryTime = video.currentTime;
      void fetchPlaybackBlob(resolved.src)
        .then((blob) => {
          if (!active) return;
          if (video.currentTime > recoveryTime + 0.2 || (!force && video.currentTime > 0.2)) {
            blobFallbackAttempted = false;
            observedPlaybackTime = video.currentTime;
            stalledChecks = 0;
            clearFallback(host);
            return;
          }
          const nextUrl = URL.createObjectURL(blob);
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          objectUrl = nextUrl;
          usingBlobFallback = true;
          if (stallTimer !== null) { window.clearInterval(stallTimer); stallTimer = null; }
          video.style.display = "";
          video.src = nextUrl;
          requestPlayback();
        })
        .catch((error: unknown) => {
          if (stallTimer !== null) { window.clearInterval(stallTimer); stallTimer = null; }
          if (active) failVideo(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          blobFallbackInProgress = false;
        });
    };

    const normalizeSource = () => {
      if (!active || !sourcePath || isManagedVideo(sourcePath) || normalizationAttempted || normalizationInProgress) return;
      normalizationAttempted = true;
      normalizationInProgress = true;
      showVideoStatus(host, "Preparing this video for playback. Long videos can take several minutes.");
      const request = importVideo(sourcePath, { legacy: true });
      void request
        .then((asset) => {
          if (!active) return;
          const normalized = resolvePlayableSource(asset.path);
          if (!normalized) throw new Error("The normalized video could not be read.");
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          objectUrl = normalized.objectUrl;
          usingNormalizedSource = true;
          video.src = normalized.src;
          if (autoPlay) requestPlayback();
        })
        .catch((error: unknown) => {
          if (active) failVideo(error instanceof Error ? error.message : describeMediaError(video));
        })
        .finally(() => {
          normalizationInProgress = false;
        });
    };

    const handleLoaded = () => {
      if (active && !normalizationInProgress) {
        video.style.display = "";
        clearFallback(host);
        onReadyRef.current?.();
        if (autoPlay) requestPlayback();
      }
    };

    const handleProgress = () => {
      if (video.currentTime > lastPlaybackTime + 0.1) {
        lastPlaybackTime = video.currentTime;
        pauseRetries = 0;
        stalledChecks = 0;
      }
      if (video.currentTime > 0.2 && normalizationTimer !== null) {
        window.clearTimeout(normalizationTimer);
        normalizationTimer = null;
      }
      if (video.currentTime > 0.2 && playbackTimer !== null) {
        window.clearTimeout(playbackTimer);
        playbackTimer = null;
      }
    };

    const handleUnexpectedPause = () => {
      if (!active || !playingRef.current || !visibleRef.current || video.ended || pauseRetries >= 3) return;
      pauseRetries += 1;
      if (pauseRetryTimer !== null) window.clearTimeout(pauseRetryTimer);
      pauseRetryTimer = window.setTimeout(requestPlayback, 250);
    };

    const handleError = () => {
      if (!active) return;
      if (resolved.src.startsWith("http://127.0.0.1:8000/api/template-video/") && !usingBlobFallback) {
        if (!blobFallbackAttempted) recoverCachedVideo(true);
        return;
      }
      if (blobFallbackInProgress) return;
      if (!usingNormalizedSource && sourcePath) {
        normalizeSource();
        return;
      }
      failVideo(describeMediaError(video));
    };

    try {
      configureVideo(video, {
        autoPlay: autoPlay && visibleRef.current,
        muted: media.muted !== false,
        loop,
        preload,
        speed: media.speed ?? 1,
        objectFit: typeof style.objectFit === "string" ? style.objectFit : "cover",
      });
      video.addEventListener("error", handleError);
      video.addEventListener("loadeddata", handleLoaded);
      video.addEventListener("canplay", requestPlayback);
      video.addEventListener("timeupdate", handleProgress);
      video.addEventListener("pause", handleUnexpectedPause);
      host.appendChild(video);
      if (!warmedVideo) {
        video.src = resolved.src;
      } else if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        handleLoaded();
      }
      if (sourcePath) {
        normalizationTimer = window.setTimeout(() => {
          // Prepared handoffs intentionally keep the incoming video paused
          // until its first frame is revealed. Do not mistake that deliberate
          // zero timestamp for a stalled player once enough data is loaded.
          if (active && playingRef.current && video.currentTime <= 0.2
            && (visibleRef.current || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)) normalizeSource();
        }, 4000);
      }
      if (autoPlay) requestPlayback();
      if (resolved.src.startsWith("http://127.0.0.1:8000/api/template-video/")) {
        playbackTimer = window.setTimeout(() => {
          if (active && playingRef.current && video.currentTime <= 0.2
            && (visibleRef.current || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)) recoverCachedVideo();
        }, 600);
        stallTimer = window.setInterval(() => {
          if (!active || blobFallbackAttempted || !playingRef.current || video.ended) return;
          if (!visibleRef.current && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
          if (video.currentTime > observedPlaybackTime + 0.1 || video.currentTime < observedPlaybackTime - 0.1) {
            observedPlaybackTime = video.currentTime;
            stalledChecks = 0;
          } else if (++stalledChecks >= 2) {
            recoverCachedVideo(true);
          }
        }, 1000);
      }
    } catch (error) {
      failVideo(error instanceof Error ? error.message : String(error));
    }

    return () => {
      active = false;
      if (normalizationTimer !== null) window.clearTimeout(normalizationTimer);
      if (playbackTimer !== null) window.clearTimeout(playbackTimer);
      if (stallTimer !== null) window.clearInterval(stallTimer);
      if (pauseRetryTimer !== null) window.clearTimeout(pauseRetryTimer);
      try {
        video.removeEventListener("error", handleError);
        video.removeEventListener("loadeddata", handleLoaded);
        video.removeEventListener("canplay", requestPlayback);
        video.removeEventListener("timeupdate", handleProgress);
        video.removeEventListener("pause", handleUnexpectedPause);
      } catch {
        // Ignore cleanup for an already-invalid media node.
      }
      let returnedToPool = false;
      try {
        video.pause();
        if (!usingBlobFallback && !usingNormalizedSource && !objectUrl && video.src === resolved.src) {
          returnedToPool = returnWarmTemplateVideo(resolved.src, video);
        }
        if (!returnedToPool) {
          video.removeAttribute("src");
        }
      } catch {
        // WebKit may reject cleanup for an already-invalid media resource.
      }
      if (!returnedToPool) {
        try {
          if (video.parentNode === host) host.removeChild(video);
        } catch {
          // The host may already have been detached by the webview.
        }
      }
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // Ignore an already-revoked/invalid object URL.
        }
      }
      if (videoRef.current === video) videoRef.current = null;
      onVideoElementChange?.(null, video);
    };
    // Source changes own the media element lifecycle. Other playback options
    // are synchronized by the effect below without forcing a re-decode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.src, sourcePath]);

  useLayoutEffect(() => {
    playingRef.current = playing;
    const video = videoRef.current;
    if (!video) return;
    configureVideo(video, {
      autoPlay: autoPlay && presentationVisible,
      muted: media.muted !== false,
      loop,
      preload,
      speed: media.speed ?? 1,
      objectFit: typeof style.objectFit === "string" ? style.objectFit : "cover",
    });
    if (playing && presentationVisible) {
      try {
        void video.play().catch(() => undefined);
      } catch {
        // Autoplay can be rejected synchronously by the embedded webview.
      }
    } else if (!playing) {
      try {
        video.pause();
      } catch {
        // WebKit may reject pausing while a media source is changing.
      }
    }
  }, [autoPlay, loop, media.muted, media.speed, onVideoElementChange, playing, preload, presentationVisible, style.objectFit]);

  // WebKit can defer a muted video while its scene has opacity zero. Retry
  // after the first visible paint instead of requiring a click on Play.
  useEffect(() => {
    if (!presentationVisible || !playing) return;
    const frame = window.requestAnimationFrame(() => {
      const video = videoRef.current;
      if (!video || !video.paused) return;
      try { void video.play().catch(() => undefined); } catch { /* The media may still be loading. */ }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [media.src, playing, presentationVisible]);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", ...style }}
    />
  );
}
