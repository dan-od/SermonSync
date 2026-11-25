import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  toggleButtonStyle,
  twoColumnGrid,
} from "./studioStyles";

interface VideoStudioModalProps {
  open: boolean;
  name: string;
  src: string;
  settings: VideoMediaSettings;
  onClose: () => void;
  onSave: (name: string, settings: VideoMediaSettings) => void;
}

export function VideoStudioModal({ open, name, src, settings, onClose, onSave }: VideoStudioModalProps) {
  const [title, setTitle] = useState(name);
  const [local, setLocal] = useState<VideoMediaSettings>(settings);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
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

  useEffect(() => {
    if (!open) return;
    const video = videoRef.current;
    return () => video?.pause();
  }, [open]);

  if (!open) return null;

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
      <section role="dialog" aria-modal="true" aria-labelledby="video-studio-title" style={modalSectionStyle}>
        <div style={modalHeaderRow}>
          <h2 id="video-studio-title" style={modalTitleStyle}>Video Studio</h2>
          <button type="button" onClick={onClose} title="Close" style={modalCloseButtonStyle}>×</button>
        </div>

        <label style={fieldLabelStyle}>
          Name
          <input value={title} onChange={(event) => setTitle(event.target.value)} style={fieldInputStyle} />
        </label>

        <div
          style={{
            width: "100%",
            aspectRatio: "16 / 9",
            borderRadius: 8,
            border: "1px solid var(--border-base)",
            background: "#000",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <video
            ref={videoRef}
            src={src}
            playsInline
            preload="metadata"
            onLoadedMetadata={(event) => {
              const nextDuration = event.currentTarget.duration;
              setDuration(nextDuration);
              setLocal((current) => (current.trimEnd == null ? { ...current, trimEnd: nextDuration } : current));
            }}
            style={{
              width: "100%",
              height: "100%",
              objectFit: local.fit,
              opacity: local.opacity,
              filter: filtersToCss(local.filters),
              transform: flipTransform(local.flipX, local.flipY),
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button type="button" onClick={togglePlay} title={isPlaying ? "Pause" : "Play"} style={playButtonStyle}>
            {isPlaying ? "Ⅱ" : "▶"}
          </button>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step="0.01"
            value={Math.min(currentTime, duration || 1)}
            onChange={handleSeek}
            style={{ flex: 1, minWidth: 0, accentColor: "var(--color-primary)" }}
          />
        </div>

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
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" style={toggleButtonStyle(local.loop)} onClick={() => setLocal({ ...local, loop: !local.loop })}>{local.loop ? "Looping" : "Loop"}</button>
          <button type="button" style={toggleButtonStyle(local.muted)} onClick={() => setLocal({ ...local, muted: !local.muted })}>{local.muted ? "Muted" : "Mute"}</button>
          <button type="button" style={toggleButtonStyle(local.flipX)} onClick={() => setLocal({ ...local, flipX: !local.flipX })}>Flip horizontally</button>
          <button type="button" style={toggleButtonStyle(local.flipY)} onClick={() => setLocal({ ...local, flipY: !local.flipY })}>Flip vertically</button>
        </div>

        <div style={sectionTitleStyle}>Filters</div>
        <MediaFiltersPanel filters={local.filters} onChange={(filters) => setLocal({ ...local, filters })} />

        <div style={modalFooterRow}>
          <button type="button" onClick={onClose} style={secondaryButtonStyle}>Cancel</button>
          <button type="button" onClick={handleSave} style={primaryButtonStyle}>Save</button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
