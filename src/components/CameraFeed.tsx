import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { getSidecarHttpBase } from "../lib/sidecarClient";
import { isLinuxWebKitCameraRuntime } from "../lib/cameraSources";

interface CameraFeedProps {
  sourceType: "local" | "network" | undefined;
  /** Local: MediaDeviceInfo.deviceId. */
  deviceId?: string;
  /** Stable camera label persisted for projector WebViews. */
  cameraLabel?: string;
  /** Network: MJPEG/HTTP stream URL. */
  url?: string;
  style?: CSSProperties;
  mirror?: boolean;
  fit?: "cover" | "contain" | "fill";
  /** Freeze only this rendered preview; other camera consumers stay live. */
  paused?: boolean;
  onReady?: () => void;
  onError?: (message: string) => void;
  retryToken?: number;
}

interface SharedLocalCamera {
  stream: MediaStream | null;
  pending: Promise<MediaStream> | null;
  consumers: number;
  releaseTimer: number | undefined;
}

// A template preview and a projector preview can coexist in the same
// WebView. Opening the same V4L2/PipeWire camera once per <CameraFeed> causes
// needless negotiation and can make WebKit appear to hang. Share one stream
// per device within a WebView and stop it only after the last consumer leaves.
const sharedLocalCameras = new Map<string, SharedLocalCamera>();
const LOCAL_CAMERA_RELEASE_GRACE_MS = 250;
const LOCAL_CAMERA_START_TIMEOUT_MS = 8000;
const LOCAL_CAMERA_PLAY_TIMEOUT_MS = 4000;

function cameraConstraints(deviceId: string): MediaStreamConstraints {
  return {
    video: {
      deviceId: { exact: deviceId },
      // Do not add width/height/frame-rate ranges here. WebKitGTK's PipeWire
      // source must first receive the camera's already-fixed V4L2 caps. Range
      // constraints make the source try to renegotiate those caps and can
      // trigger `gst_caps_is_fixed (pwsrc->caps)` for virtual cameras such as
      // DroidCam. The device's native format is already 1280x720 at 30 fps.
    },
    audio: false,
  };
}

async function requestLocalCamera(deviceId: string): Promise<MediaStream> {
  const request = navigator.mediaDevices.getUserMedia(cameraConstraints(deviceId));
  let timeoutId: number | undefined;
  const timeout = new Promise<MediaStream>((_, reject) => {
    timeoutId = window.setTimeout(
      () => reject(new Error("Timed out while starting the selected camera.")),
      LOCAL_CAMERA_START_TIMEOUT_MS,
    );
  });

  try {
    const stream = await Promise.race([request, timeout]);
    return stream;
  } catch (error) {
    // WebKit may resolve a stalled request after the UI has already shown the
    // timeout. Do not leave that late stream consuming the camera.
    void request.then((stream) => stream.getTracks().forEach((track) => track.stop())).catch(() => undefined);
    throw error;
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

async function acquireLocalCamera(deviceId: string): Promise<MediaStream> {
  let entry = sharedLocalCameras.get(deviceId);
  if (!entry) {
    entry = { stream: null, pending: null, consumers: 0, releaseTimer: undefined };
    sharedLocalCameras.set(deviceId, entry);
  }

  entry.consumers += 1;
  if (entry.releaseTimer !== undefined) {
    window.clearTimeout(entry.releaseTimer);
    entry.releaseTimer = undefined;
  }
  if (entry.stream?.active) return entry.stream;

  if (!entry.pending) {
    entry.pending = requestLocalCamera(deviceId).then(
      (stream) => {
        entry!.stream = stream;
        entry!.pending = null;
        return stream;
      },
      (error) => {
        entry!.pending = null;
        if (entry!.consumers === 0) sharedLocalCameras.delete(deviceId);
        throw error;
      },
    );
  }
  return entry.pending;
}

async function getNativeFallbackUrl(deviceId: string | undefined, cameraLabel?: string): Promise<string> {
  if (deviceId?.startsWith("/dev/video")) {
    const params = new URLSearchParams({ device: deviceId, t: String(Date.now()) });
    if (cameraLabel) params.set("label", cameraLabel);
    return `${getSidecarHttpBase()}/api/camera/mjpeg?${params}`;
  }
  let label = cameraLabel?.trim();
  if (!label && deviceId) {
    const devices = await navigator.mediaDevices.enumerateDevices();
    label = devices.find((device) => device.kind === "videoinput" && device.deviceId === deviceId)?.label;
  }
  if (!label) throw new Error("The selected camera name is unavailable to the native camera bridge.");
  return `${getSidecarHttpBase()}/api/camera/mjpeg?label=${encodeURIComponent(label)}&t=${Date.now()}`;
}

function releaseLocalCamera(deviceId: string): void {
  const entry = sharedLocalCameras.get(deviceId);
  if (!entry) return;
  entry.consumers = Math.max(0, entry.consumers - 1);
  if (entry.consumers > 0 || entry.releaseTimer !== undefined) return;

  // React development effects can mount/unmount once during Strict Mode. A
  // short grace period prevents that lifecycle check from restarting the
  // hardware stream and producing visible stutter.
  entry.releaseTimer = window.setTimeout(() => {
    const current = sharedLocalCameras.get(deviceId);
    if (!current || current.consumers > 0) return;
    current.stream?.getTracks().forEach((track) => track.stop());
    sharedLocalCameras.delete(deviceId);
  }, LOCAL_CAMERA_RELEASE_GRACE_MS);
}

/**
 * Renders a live camera feed used as a template's background. Wired/USB
 * cameras use the native MJPEG bridge on Linux WebKit and otherwise stream via
 * `getUserMedia`; local previews in the same WebView share one capture of a
 * device to avoid duplicate V4L2/PipeWire negotiation. Wi-Fi phone cameras
 * (DroidCam, IP Webcam,
 * iVCam) are plain HTTP MJPEG streams, so an `<img>` pointed at the stream
 * URL works anywhere without extra wiring.
 */
export function CameraFeed({ sourceType, deviceId, cameraLabel, url, style, mirror = false, fit = "cover", paused = false, onReady, onError, retryToken = 0 }: CameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const pausedRef = useRef(paused);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [frozenFrame, setFrozenFrame] = useState<string | null>(null);
  const missingDeviceError = sourceType === "local" && !deviceId && !cameraLabel ? "No camera device was selected." : null;

  useEffect(() => {
    if (error) onError?.(error);
  }, [error, onError]);

  useEffect(() => {
    if (missingDeviceError) onError?.(missingDeviceError);
  }, [missingDeviceError, onError]);

  const freezeImage = useCallback(() => {
    if (sourceType === "local" && fallbackUrl) {
      const snapshotUrl = new URL(fallbackUrl);
      snapshotUrl.pathname = snapshotUrl.pathname.replace(/\/mjpeg$/, "/frame");
      snapshotUrl.searchParams.set("t", String(Date.now()));
      setFrozenFrame(snapshotUrl.toString());
      return;
    }
    const image = imageRef.current;
    if (!image || !image.naturalWidth || !image.naturalHeight) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(image, 0, 0);
      setFrozenFrame(canvas.toDataURL("image/png"));
    } catch {
      // A third-party MJPEG feed may disallow canvas reads. Hide that live
      // image while paused rather than presenting moving frames as frozen.
      setFrozenFrame(null);
    }
  }, [fallbackUrl, sourceType]);

  useEffect(() => {
    pausedRef.current = paused;
    if (!paused) {
      queueMicrotask(() => setFrozenFrame(null));
      const video = videoRef.current;
      if (video?.srcObject) void video.play().catch(() => undefined);
      return;
    }
    if (sourceType === "local" && !fallbackUrl) {
      videoRef.current?.pause();
    } else {
      const frame = window.requestAnimationFrame(freezeImage);
      return () => window.cancelAnimationFrame(frame);
    }
  }, [paused, sourceType, fallbackUrl, url, freezeImage]);

  useEffect(() => {
    if (sourceType !== "local" || (!deviceId && !cameraLabel)) {
      streamRef.current = null;
      return;
    }

    let cancelled = false;
    const videoElement = videoRef.current;
    let release: (() => void) | null = null;
    let endedTrack: MediaStreamTrack | null = null;
    let handleTrackEnded: (() => void) | null = null;

    const start = async () => {
      setIsStarting(true);
      setFallbackUrl(null);
      setError(null);
      try {
        if (isLinuxWebKitCameraRuntime()) {
          try {
            const nativeUrl = await getNativeFallbackUrl(deviceId, cameraLabel);
            if (!cancelled) {
              setFallbackUrl(nativeUrl);
              setError(null);
            }
          } catch (error) {
            if (!cancelled) {
              setIsStarting(false);
              setError(error instanceof Error ? error.message : "The native camera bridge is unavailable.");
            }
          }
          return;
        }
        if (!deviceId) throw new Error("The selected camera has no browser device id.");
        const stream = await acquireLocalCamera(deviceId);
        release = () => releaseLocalCamera(deviceId);
        if (cancelled) {
          release();
          release = null;
          return;
        }

        streamRef.current = stream;
        const video = videoElement;
        if (!video) throw new Error("Camera preview element is unavailable.");
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        endedTrack = stream.getVideoTracks()[0] ?? null;
        handleTrackEnded = () => {
          if (!cancelled) {
            streamRef.current = null;
            release?.();
            release = null;
            setIsStarting(false);
            setError("The camera stream ended unexpectedly.");
          }
        };
        endedTrack?.addEventListener("ended", handleTrackEnded);
        const playRequest = video.play();
        let playTimeoutId: number | undefined;
        const playTimeout = new Promise<void>((_, reject) => {
          playTimeoutId = window.setTimeout(
            () => reject(new Error("Timed out while rendering the camera preview.")),
            LOCAL_CAMERA_PLAY_TIMEOUT_MS,
          );
        });
        try {
          await Promise.race([playRequest, playTimeout]);
        } finally {
          if (playTimeoutId !== undefined) window.clearTimeout(playTimeoutId);
        }
        if (!cancelled) {
          if (pausedRef.current) video.pause();
          setError(null);
          setIsStarting(false);
        }
      } catch (err) {
        if (endedTrack && handleTrackEnded) endedTrack.removeEventListener("ended", handleTrackEnded);
        if (videoElement?.srcObject === streamRef.current) {
          videoElement.pause();
          videoElement.srcObject = null;
        }
        release?.();
        release = null;
        if (!cancelled) {
          setIsStarting(false);
          setError(err instanceof Error ? err.message : "Unable to start the selected camera.");
        }
      }
    };

    void start();
    return () => {
      cancelled = true;
      if (videoElement?.srcObject === streamRef.current) {
        videoElement.pause();
        videoElement.srcObject = null;
      }
      if (endedTrack && handleTrackEnded) endedTrack.removeEventListener("ended", handleTrackEnded);
      streamRef.current = null;
      release?.();
      release = null;
    };
  }, [cameraLabel, deviceId, retryToken, sourceType]);

  useEffect(() => {
    if (sourceType !== "local" || !deviceId) return;
    const video = videoRef.current;
    if (!video) return;
    const handleVideoError = () => {
      setIsStarting(false);
      setError("The camera stream could not be rendered by the WebView.");
    };
    video.addEventListener("error", handleVideoError);
    return () => video.removeEventListener("error", handleVideoError);
  }, [deviceId, sourceType]);

  const transform = mirror ? "scaleX(-1)" : undefined;
  const localError = error ?? missingDeviceError;

  if (sourceType === "local") {
    if (fallbackUrl) {
      return (
        <div style={{ ...style, position: style?.position ?? "relative", overflow: "hidden", background: "#0b0d12" }}>
          {paused && frozenFrame ? <img src={frozenFrame} alt="Paused camera preview" onError={() => setFrozenFrame(null)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: fit, transform }} /> : null}
          {!paused || !frozenFrame ? <img
            ref={imageRef}
            key={fallbackUrl}
            src={fallbackUrl}
            alt=""
            onLoad={() => { setError(null); setIsStarting(false); onReady?.(); if (pausedRef.current) freezeImage(); }}
            onError={() => {
              setFallbackUrl(null);
              setIsStarting(false);
              setError("The camera feed stopped. Retry, or check its connection and other apps using it.");
            }}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: fit, transform, visibility: paused ? "hidden" : "visible" }}
          /> : null}
          {paused && !frozenFrame ? <div aria-label="Camera preview paused" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#b8bdca", fontFamily: "var(--font-mono)", fontSize: "11px" }}>CAMERA PREVIEW PAUSED</div> : null}
          {isStarting ? (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#b8bdca", fontFamily: "var(--font-mono)", fontSize: "11px", background: "rgba(11, 13, 18, 0.72)" }}>
              Starting camera…
            </div>
          ) : null}
        </div>
      );
    }
    return localError ? (
      <div aria-label="Camera unavailable" style={{ ...style, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "#0b0d12", color: "#f66", fontFamily: "var(--font-mono)", fontSize: "12px", textAlign: "center", padding: onError ? undefined : "12px" }}>
        {onError ? null : `Camera unavailable: ${localError}`}
      </div>
    ) : (
      <div style={{ ...style, position: style?.position ?? "relative", overflow: "hidden", background: "#0b0d12" }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          onLoadedData={onReady}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: fit, transform }}
        />
        {isStarting ? (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#b8bdca", fontFamily: "var(--font-mono)", fontSize: "11px", background: "rgba(11, 13, 18, 0.72)" }}>
            Starting camera…
          </div>
        ) : null}
      </div>
    );
  }

  if (sourceType === "network" && url) {
    return `${url}\u0000${retryToken}` === failedUrl ? (
      <div style={{ ...style, display: "flex", alignItems: "center", justifyContent: "center", color: "#f66", fontFamily: "var(--font-mono)", fontSize: "12px", textAlign: "center", padding: "12px" }}>
        No picture from this camera. Confirm its app is actively streaming and reachable at {url}.
      </div>
    ) : (
      <div style={{ ...style, position: style?.position ?? "relative", overflow: "hidden", background: "#0b0d12" }}>
        {paused && frozenFrame ? <img src={frozenFrame} alt="Paused camera preview" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: fit, transform }} /> : null}
        {!paused || !frozenFrame ? <img ref={imageRef} key={`${url}\u0000${retryToken}`} src={url} alt="" onLoad={() => { setError(null); onReady?.(); if (pausedRef.current) freezeImage(); }} onError={() => { setFailedUrl(`${url}\u0000${retryToken}`); setError("No picture from this network camera. Check that it is streaming and reachable."); }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: fit, transform, visibility: paused ? "hidden" : "visible" }} /> : null}
        {paused && !frozenFrame ? <div aria-label="Camera preview paused" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#b8bdca", fontFamily: "var(--font-mono)", fontSize: "11px" }}>CAMERA PREVIEW PAUSED</div> : null}
      </div>
    );
  }

  return null;
}
