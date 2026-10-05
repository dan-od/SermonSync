import type { CSSProperties } from "react";

import type { TemplateBackgroundMedia } from "../types/templates";
import { CameraFeed } from "./CameraFeed";

/** The camera's saved crop is measured against the uncropped feed. */
export function CameraViewport({ media, style, paused, onReady, onError, retryToken, thumbnail = false }: {
  media: TemplateBackgroundMedia;
  style?: CSSProperties;
  paused?: boolean;
  onReady?: () => void;
  onError?: (message: string) => void;
  retryToken?: number;
  thumbnail?: boolean;
}) {
  const left = Math.max(0, Math.min(95, media.cropLeft ?? 0));
  const right = Math.max(0, Math.min(95 - left, media.cropRight ?? 0));
  const top = Math.max(0, Math.min(95, media.cropTop ?? 0));
  const bottom = Math.max(0, Math.min(95 - top, media.cropBottom ?? 0));
  const visibleWidth = (100 - left - right) / 100;
  const visibleHeight = (100 - top - bottom) / 100;

  const sourceStyle: CSSProperties = {
    position: "absolute",
    left: `${-left / visibleWidth}%`,
    top: `${-top / visibleHeight}%`,
    width: `${100 / visibleWidth}%`,
    height: `${100 / visibleHeight}%`,
  };

  return <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#0b0d12", ...style }}>
    {thumbnail ? <div style={{ ...sourceStyle, background: "linear-gradient(135deg, #132236, #143f54 55%, #10151e)" }} /> : <CameraFeed
      sourceType={media.cameraSourceType}
      deviceId={media.cameraDeviceId}
      cameraLabel={media.cameraLabel}
      url={media.cameraUrl}
      mirror={media.flipX}
      fit={media.fit}
      paused={paused}
      onReady={onReady}
      onError={onError}
      retryToken={retryToken}
      style={sourceStyle}
    />}
    {thumbnail ? <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#b6c4d3", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em" }}>LIVE CAMERA</div> : null}
  </div>;
}
