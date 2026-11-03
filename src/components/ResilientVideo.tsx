import { useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import type { TemplateBackgroundMedia } from "../types/templates";
import { isStagedTemplateVideo } from "../lib/templateVideo";
import { returnWarmTemplateVideo, takeWarmTemplateVideo } from "../lib/templateVideoWarmup";
import { importVideo, isManagedVideo } from "../lib/videoImport";
import { clearFallback, showVideoStatus, resolvePlayableSource, hideVideo, fetchPlaybackBlob, describeMediaError, configureVideo } from "./resilientVideoHelpers";

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
          console.warn("[ResilientVideo] blob playback recovery skipped/failed:", error);
          if (active && force) failVideo(error instanceof Error ? error.message : String(error));
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
            && (visibleRef.current || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)) recoverCachedVideo(false);
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
