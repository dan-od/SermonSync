import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { importVideo, isManagedVideo, managedVideoUrl } from "../../lib/videoImport";

import { filtersToCss, flipTransform } from "../../lib/mediaFilters";
import type { VideoMediaSettings } from "../../types/media";
import { Dropdown } from "../Settings/primitives";
import { MediaFiltersPanel } from "./MediaFiltersPanel";
import {
  fieldInputStyle,
  fieldLabelStyle,
  modalBackdropStyle,
  modalCloseButtonStyle,
  modalFooterRow,
  modalHeaderRow,
  modalSectionStyle,
  modalTitleStyle,
  playButtonStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  sectionTitleStyle,
  studioCanvasColumnStyle,
  studioFooterStyle,
  studioInspectorStyle,
  studioStageStyle,
  studioWorkspaceStyle,
  toggleButtonStyle,
  twoColumnGrid,
} from "./studioStyles";

interface VideoStudioModalProps {
  open: boolean;
  name: string;
  src: string;
  sourcePath?: string;
  settings: VideoMediaSettings;
  onClose: () => void;
  onSave: (name: string, settings: VideoMediaSettings) => void;
}

type VideoStudioContentProps = Omit<VideoStudioModalProps, "open">;

export function VideoStudioModal(props: VideoStudioModalProps) {
  if (!props.open) return null;

  return (
    <VideoStudioContent
      key={`${props.src}:${props.name}`}
      name={props.name}
      src={props.src}
      sourcePath={props.sourcePath}
      settings={props.settings}
      onClose={props.onClose}
      onSave={props.onSave}
    />
  );
}

function VideoStudioContent({ name, src, sourcePath, settings, onClose, onSave }: VideoStudioContentProps) {
  const [title, setTitle] = useState(name);
  const [local, setLocal] = useState<VideoMediaSettings>(settings);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSrc, setPlaybackSrc] = useState(src);
  const [normalizationAttempted, setNormalizationAttempted] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = Math.max(0, Math.min(1, local.volume));
    video.muted = local.muted;
    video.loop = local.loop;
    video.playbackRate = local.speed;
  }, [local.volume, local.muted, local.loop, local.speed]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (local.trimEnd != null && video.currentTime >= local.trimEnd) {
        if (local.loop) {
          video.currentTime = local.trimStart;
        } else {
          video.pause();
          setIsPlaying(false);
        }
      }
    };
    const handleEnded = () => setIsPlaying(false);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handleEnded);
    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handleEnded);
    };
  }, [local.trimEnd, local.trimStart, local.loop]);

  useEffect(() => () => videoRef.current?.pause(), []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
      return;
    }
    if (video.currentTime < local.trimStart || (local.trimEnd != null && video.currentTime >= local.trimEnd)) {
      video.currentTime = local.trimStart;
    }
    void video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  };

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    const time = Number(event.target.value);
    if (video && Number.isFinite(time)) video.currentTime = time;
    setCurrentTime(time);
  };

  const handleSave = () => {
    const effectiveDuration = duration || local.trimEnd || local.trimStart;
    onSave(title.trim() || name, {
      ...local,
      trimStart: Math.max(0, Math.min(local.trimStart, effectiveDuration)),
      trimEnd: local.trimEnd != null ? Math.max(0, Math.min(local.trimEnd, effectiveDuration)) : null,
    });
  };

  return createPortal(
    <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} style={modalBackdropStyle}>
      <section className="studio-modal" role="dialog" aria-modal="true" aria-labelledby="video-studio-title" style={modalSectionStyle}>
        <div style={modalHeaderRow}>
          <div>
            <h2 id="video-studio-title" style={modalTitleStyle}>Video Canvas Studio</h2>
            <div style={{ marginTop: 4, color: "var(--fg-subtle)", fontSize: 11 }}>Preview, trim, and tune this motion asset for live projection.</div>
          </div>
          <button type="button" onClick={onClose} title="Close" style={modalCloseButtonStyle}>×</button>
        </div>

        <div style={studioWorkspaceStyle}>
          <div style={studioCanvasColumnStyle}>
            <label style={fieldLabelStyle}>
              Asset name
              <input value={title} onChange={(event) => setTitle(event.target.value)} style={fieldInputStyle} />
            </label>
            <div style={{ ...studioStageStyle, flex: 1, minHeight: 0 }}>
              <video ref={videoRef} src={playbackSrc} playsInline preload="metadata" onError={() => { if (!sourcePath || isManagedVideo(sourcePath) || normalizationAttempted) return; setNormalizationAttempted(true); void importVideo(sourcePath, { legacy: true }).then((asset) => setPlaybackSrc(managedVideoUrl(asset.path) ?? asset.path)).catch(() => undefined); }} onLoadedMetadata={(event) => { const nextDuration = event.currentTarget.duration; setDuration(nextDuration); setLocal((current) => (current.trimEnd == null ? { ...current, trimEnd: nextDuration } : current)); }} style={{ width: "100%", height: "100%", objectFit: local.fit, opacity: local.opacity, filter: filtersToCss(local.filters), transform: flipTransform(local.flipX, local.flipY) }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button type="button" onClick={togglePlay} title={isPlaying ? "Pause" : "Play"} style={playButtonStyle}>{isPlaying ? "Ⅱ" : "▶"}</button>
              <input type="range" min={0} max={duration || 1} step="0.01" value={Math.min(currentTime, duration || 1)} onChange={handleSeek} style={{ flex: 1, minWidth: 0, accentColor: "var(--color-primary)" }} />
              <span style={{ color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", fontSize: 10 }}>{currentTime.toFixed(1)}s</span>
            </div>
          </div>
          <aside className="studio-scroll-pane" style={studioInspectorStyle}>
            <div style={sectionTitleStyle}>PLAYBACK</div>
            <div style={twoColumnGrid}>
          <label style={fieldLabelStyle}>
            Fit
            <Dropdown
              value={local.fit}
              options={[
                { value: "cover", label: "Cover" },
                { value: "contain", label: "Contain" },
                { value: "fill", label: "Fill" },
              ]}
              onChange={(fit) => setLocal({ ...local, fit: fit as VideoMediaSettings["fit"] })}
              triggerStyle={fieldInputStyle}
            />
          </label>
            </div>
            <div style={sectionTitleStyle}>TIMELINE</div>
            <div style={twoColumnGrid}>
          <label style={fieldLabelStyle}>
            Speed
            <input
              type="number"
              min={0.25}
              max={4}
              step="0.05"
              value={local.speed}
              onChange={(event) => setLocal({ ...local, speed: Math.max(0.1, Number(event.target.value) || 1) })}
              style={fieldInputStyle}
            />
          </label>
            </div>
          <label style={fieldLabelStyle}>
            Trim start (s)
            <input
              type="number"
              min={0}
              max={duration || undefined}
              step="0.1"
              value={local.trimStart.toFixed(1)}
              onChange={(event) => setLocal({ ...local, trimStart: Math.max(0, Number(event.target.value) || 0) })}
              style={fieldInputStyle}
            />
          </label>
          <label style={fieldLabelStyle}>
            Trim end (s)
            <input
              type="number"
              min={0}
              max={duration || undefined}
              step="0.1"
              value={(local.trimEnd ?? duration).toFixed(1)}
              onChange={(event) => setLocal({ ...local, trimEnd: Math.max(0, Number(event.target.value) || 0) })}
              style={fieldInputStyle}
            />
          </label>
          <label style={fieldLabelStyle}>
            Volume ({Math.round(local.volume * 100)}%)
            <input type="range" min={0} max={1} step={0.01} value={local.volume} onChange={(event) => setLocal({ ...local, volume: Number(event.target.value) })} />
          </label>
          <label style={fieldLabelStyle}>
            Opacity ({Math.round(local.opacity * 100)}%)
            <input type="range" min={0} max={1} step={0.01} value={local.opacity} onChange={(event) => setLocal({ ...local, opacity: Number(event.target.value) })} />
          </label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" style={toggleButtonStyle(local.loop)} onClick={() => setLocal({ ...local, loop: !local.loop })}>{local.loop ? "Looping" : "Loop"}</button>
          <button type="button" style={toggleButtonStyle(local.muted)} onClick={() => setLocal({ ...local, muted: !local.muted })}>{local.muted ? "Muted" : "Mute"}</button>
          <button type="button" style={toggleButtonStyle(local.flipX)} onClick={() => setLocal({ ...local, flipX: !local.flipX })}>Flip horizontally</button>
          <button type="button" style={toggleButtonStyle(local.flipY)} onClick={() => setLocal({ ...local, flipY: !local.flipY })}>Flip vertically</button>
            </div>
            <div style={sectionTitleStyle}>FILTERS</div>
            <MediaFiltersPanel filters={local.filters} onChange={(filters) => setLocal({ ...local, filters })} />
          </aside>
        </div>

        <div style={studioFooterStyle}>
          <span style={{ color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", fontSize: 10 }}>VIDEO ASSET</span>
          <div style={modalFooterRow}>
          <button type="button" onClick={onClose} style={secondaryButtonStyle}>Cancel</button>
          <button type="button" onClick={handleSave} style={primaryButtonStyle}>Save</button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
