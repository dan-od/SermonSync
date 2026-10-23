import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { filtersToCss, flipTransform } from "../../../lib/mediaFilters";
import { isManagedVideo, managedVideoPosterUrl, managedVideoUrl } from "../../../lib/videoImport";
import { warmPreparedVideo } from "../../../lib/templateVideoWarmup";
import { isManagedAudio, managedAudioUrl } from "../../../lib/audioImport";
import { audioPlaybackErrorMessage, getSharedAudioElement, pauseSharedAudioPlayback, startSharedAudioPlayback } from "../../../lib/audioPlayback";
import { useProjectorStore } from "../../../stores/projectorStore";
import type { ProjectorMedia } from "../../../types/state";
import type { MediaItem } from "../../../types/media";
import { ResilientImage } from "../../ResilientImage";
import { isTauriRuntime } from "../utils";

export const MediaThumbnail = memo(function MediaThumbnail({ item, isSelected, onSelect, clickAction, onContextMenu, onPreviewMedia, onSendMedia }: {
  item: MediaItem;
  isSelected: boolean;
  onSelect: (path: string) => void;
  clickAction: "preview" | "live";
  onContextMenu: (event: React.MouseEvent, item: MediaItem) => void;
  onPreviewMedia?: (media: ProjectorMedia) => void;
  onSendMedia?: (media: ProjectorMedia) => void;
}) {
  const tileRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(() => typeof IntersectionObserver === "undefined");
  const [thumbnail, setThumbnail] = useState<{ key: string; src: string | null } | null>(null);
  const [failedPosterPath, setFailedPosterPath] = useState<string | null>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const src = useMemo(() => {
    try { return managedVideoUrl(item.path) ?? convertFileSrc(item.path); } catch { return ""; }
  }, [item.path]);
  const thumbnailKey = `${item.category}:${item.path}`;
  const nativeRuntime = isTauriRuntime();
  const managedPoster = item.category === "videos" ? managedVideoPosterUrl(item.path) : null;
  const posterFailed = managedPoster !== null && failedPosterPath === item.path;
  const snapshot = managedPoster !== null ? posterFailed ? null : managedPoster : thumbnail?.key === thumbnailKey ? thumbnail.src : undefined;
  const useFallback = !nativeRuntime || snapshot === null;
  const projectorMedia = {
    path: item.path,
    name: item.name,
    category: item.category,
    fit: item.videoSettings?.fit ?? item.imageSettings?.fit ?? "cover",
    opacity: item.videoSettings?.opacity ?? item.imageSettings?.opacity ?? 1,
    ...(item.category === "audio" ? { audioSettings: item.audioSettings } : {}),
  } satisfies ProjectorMedia;
  const settings = item.category === "images" ? item.imageSettings : item.videoSettings;

  useEffect(() => {
    const tile = tileRef.current;
    if (!tile || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setInView(true);
        observer.disconnect();
      }
    }, { rootMargin: "240px" });
    observer.observe(tile);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView || !nativeRuntime) return;
    if (item.category === "videos" && isManagedVideo(item.path)) return;
    let active = true;
    void invoke<string>("create_media_thumbnail", { path: item.path, category: item.category })
      .then((path) => {
        if (!active) return;
        if (item.category === "images") {
          void invoke<string>("read_template_image_file", { path })
            .then((dataUrl) => { if (active) setThumbnail({ key: thumbnailKey, src: dataUrl }); })
            .catch(() => {
              if (!active) return;
              try { setThumbnail({ key: thumbnailKey, src: convertFileSrc(path) }); }
              catch { setThumbnail({ key: thumbnailKey, src: null }); }
            });
        } else {
          try { setThumbnail({ key: thumbnailKey, src: convertFileSrc(path) }); }
          catch { setThumbnail({ key: thumbnailKey, src: null }); }
        }
      })
      .catch(() => { if (active) setThumbnail({ key: thumbnailKey, src: null }); });
    return () => { active = false; };
  }, [inView, item.category, item.path, nativeRuntime, thumbnailKey]);

  const activate = (action: "preview" | "live" = clickAction) => {
    if (item.category === "audio" && !isManagedAudio(item.path)) return;
    const owner = action === "live" ? "live" : "preview";
    if (item.category === "audio") {
      const state = useProjectorStore.getState();
      const liveAudioActive = state.feedOverride === "live" && state.liveMedia?.category === "audio" && state.livePlayback.playing;
      if (owner === "live" || !liveAudioActive) {
        const playbackSrc = managedAudioUrl(item.path);
        if (playbackSrc) void startSharedAudioPlayback(playbackSrc, {
          volume: item.audioSettings?.volume ?? 1,
          trimStart: item.audioSettings?.trimStart ?? 0,
          trimEnd: item.audioSettings?.trimEnd ?? null,
          loop: false,
        }, owner).catch((error: unknown) => {
          const message = audioPlaybackErrorMessage(error, getSharedAudioElement());
          console.error(`Could not play audio asset ${item.name}: ${message}`);
          if (owner === "live") useProjectorStore.getState().setLiveAudioPlaybackError(item.path, message);
        });
      }
    } else {
      pauseSharedAudioPlayback(owner);
    }
    onSelect(item.path);
    if (action === "preview") onPreviewMedia?.(projectorMedia);
    else onSendMedia?.(projectorMedia);
  };

  const imageSrc = typeof snapshot === "string" ? snapshot : item.category === "images" && useFallback ? src : "";
  return (
    <div style={{ minWidth: 0 }}>
      <div
        ref={tileRef}
        role="button"
        tabIndex={0}
        aria-pressed={isSelected}
        aria-label={`${clickAction === "preview" ? "Preview" : "Send live"} ${item.name}`}
        title={item.category === "audio" && !isManagedAudio(item.path) ? `${item.name} · Preparing audio` : `${item.name} · Click to ${clickAction === "preview" ? "preview" : "send live"}; right-click to edit`}
        onClick={() => activate()}
        onPointerEnter={() => { if (item.category === "videos" && isManagedVideo(item.path)) warmPreparedVideo(item.path); }}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); } }}
        onDoubleClick={() => { if (clickAction === "preview") activate("live"); }}
        onContextMenu={(event) => onContextMenu(event, item)}
        style={{ display: "block", position: "relative", width: "100%", aspectRatio: "16 / 9", padding: 0, overflow: "hidden", border: isSelected ? "2px solid var(--color-primary)" : "1px solid var(--border-base)", borderRadius: "var(--radius-md)", background: "var(--bg-elevated)", cursor: "pointer", textAlign: "left", boxShadow: "var(--shadow-sm)" }}
      >
        {inView && imageSrc && item.category === "images" ? (
          <ResilientImage src={imageSrc} sourcePath={item.path} alt="" loading="eager" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: settings?.opacity ?? 1, filter: filtersToCss(settings?.filters), transform: flipTransform(settings?.flipX, settings?.flipY) }} />
        ) : null}
        {inView && imageSrc && item.category === "videos" ? (
          <img src={imageSrc} alt="" loading="lazy" onError={() => {
            if (managedPoster !== null) setFailedPosterPath(item.path);
            else if (typeof snapshot === "string") setThumbnail({ key: thumbnailKey, src: null });
          }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: settings?.opacity ?? 1, filter: filtersToCss(settings?.filters), transform: flipTransform(settings?.flipX, settings?.flipY) }} />
        ) : null}
        {inView && item.category === "videos" && managedPoster === null && useFallback && !videoFailed ? (
          <video src={src} muted playsInline preload="metadata" onLoadedMetadata={(event) => { const video = event.currentTarget; try { video.currentTime = Math.min(0.2, video.duration / 2); } catch { /* Keep the first frame. */ } }} onError={() => setVideoFailed(true)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: settings?.opacity ?? 1, filter: filtersToCss(settings?.filters), transform: flipTransform(settings?.flipX, settings?.flipY) }} />
        ) : null}
        {inView && posterFailed ? <span aria-hidden="true" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--fg-muted)", fontSize: 11 }}>Preview unavailable</span> : null}
        {inView && item.category === "audio" && typeof snapshot === "string" ? <img src={snapshot} alt={`${item.name} cover`} loading="lazy" onError={() => setThumbnail({ key: thumbnailKey, src: null })} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : null}
        {inView && item.category === "audio" && typeof snapshot !== "string" ? <span aria-hidden="true" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--fg-muted)", fontSize: 28 }}>♪</span> : null}
        {item.category === "audio" && !isManagedAudio(item.path) ? <span role="status" style={{ position: "absolute", left: 8, right: 8, top: 8, color: "#fff", fontSize: 11, textAlign: "center", background: "rgba(0,0,0,.7)", borderRadius: 4, padding: 4 }}>Preparing audio…</span> : null}
        {videoFailed ? <span aria-hidden="true" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--fg-muted)", fontSize: 26 }}>▣</span> : null}
        <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "16px 8px 6px", background: "linear-gradient(transparent, rgba(0,0,0,.78))", color: "#fff", fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", pointerEvents: "none" }}>{item.name}</span>
      </div>
    </div>
  );
});
