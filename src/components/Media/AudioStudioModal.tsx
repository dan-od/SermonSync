import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useAudioPeaks } from "../../lib/waveform";
import type { AudioMediaSettings } from "../../types/media";
import { WaveformCanvas } from "./Waveform";
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
  twoColumnGrid,
} from "./studioStyles";

interface AudioStudioModalProps {
  open: boolean;
  name: string;
  src: string;
  sourcePath: string;
  settings: AudioMediaSettings;
  onClose: () => void;
  onSave: (name: string, settings: AudioMediaSettings) => void;
}

export function AudioStudioModal({ open, name, src, sourcePath, settings, onClose, onSave }: AudioStudioModalProps) {
  const [title, setTitle] = useState(name);
  const [volume, setVolume] = useState(settings.volume);
  const [trimStart, setTrimStart] = useState(settings.trimStart);
  const [trimEnd, setTrimEnd] = useState<number | null>(settings.trimEnd);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { peaks, duration, loading, error } = useAudioPeaks(open ? src : null, 220, sourcePath);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = Math.max(0, Math.min(1, volume));
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (trimEnd != null && audio.currentTime >= trimEnd) {
        audio.pause();
        setIsPlaying(false);
      }
    };
    const handleEnded = () => setIsPlaying(false);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [trimEnd]);

  useEffect(() => {
    if (!open) return;
    const audio = audioRef.current;
    return () => audio?.pause();
  }, [open]);

  if (!open) return null;

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }
    if (audio.currentTime < trimStart || (trimEnd != null && audio.currentTime >= trimEnd)) {
      audio.currentTime = trimStart;
    }
    void audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  };

  const handleSeek = (time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const handleSave = () => {
    const effectiveDuration = duration || trimEnd || trimStart;
    onSave(title.trim() || name, {
      volume,
      trimStart: Math.max(0, Math.min(trimStart, effectiveDuration)),
      trimEnd: trimEnd != null ? Math.max(0, Math.min(trimEnd, effectiveDuration)) : null,
    });
  };

  return createPortal(
    <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} style={modalBackdropStyle}>
      <section role="dialog" aria-modal="true" aria-labelledby="audio-studio-title" style={modalSectionStyle}>
        <div style={modalHeaderRow}>
          <h2 id="audio-studio-title" style={modalTitleStyle}>Audio Studio</h2>
          <button type="button" onClick={onClose} title="Close" style={modalCloseButtonStyle}>×</button>
        </div>

        <label style={fieldLabelStyle}>
          Name
          <input value={title} onChange={(event) => setTitle(event.target.value)} style={fieldInputStyle} />
        </label>

        <audio
          ref={audioRef}
          src={src}
          preload="auto"
          onLoadedMetadata={(event) => {
            if (trimEnd == null) setTrimEnd(event.currentTarget.duration);
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button type="button" onClick={togglePlay} title={isPlaying ? "Pause" : "Play"} style={playButtonStyle}>
            {isPlaying ? "Ⅱ" : "▶"}
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            {loading ? (
              <div style={{ color: "var(--fg-subtle)", fontSize: 12 }}>Decoding waveform…</div>
            ) : error ? (
              <div style={{ color: "var(--color-error)", fontSize: 12 }}>{error}</div>
            ) : (
              <WaveformCanvas
                peaks={peaks}
                duration={duration}
                currentTime={currentTime}
                trimStart={trimStart}
                trimEnd={trimEnd}
                height={72}
                onSeek={handleSeek}
              />
            )}
          </div>
        </div>

        <div style={twoColumnGrid}>
          <label style={fieldLabelStyle}>
            Trim start (s)
            <input
              type="number"
              min={0}
              max={duration || undefined}
              step="0.1"
              value={trimStart.toFixed(1)}
              onChange={(event) => setTrimStart(Math.max(0, Number(event.target.value) || 0))}
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
              value={(trimEnd ?? duration).toFixed(1)}
              onChange={(event) => setTrimEnd(Math.max(0, Number(event.target.value) || 0))}
              style={fieldInputStyle}
            />
          </label>
        </div>

        <label style={fieldLabelStyle}>
          Volume ({Math.round(volume * 100)}%)
          <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
        </label>

        <div style={modalFooterRow}>
          <button type="button" onClick={onClose} style={secondaryButtonStyle}>Cancel</button>
          <button type="button" onClick={handleSave} style={primaryButtonStyle}>Save</button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
