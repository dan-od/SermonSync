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
  studioCanvasColumnStyle,
  studioFooterStyle,
  studioInspectorStyle,
  studioStageStyle,
  studioWorkspaceStyle,
  twoColumnGrid,
} from "./studioStyles";

interface AudioStudioModalProps {
  open: boolean;
  name: string;
  src: string;
  settings: AudioMediaSettings;
  onClose: () => void;
  onSave: (name: string, settings: AudioMediaSettings) => void;
}

type AudioStudioContentProps = Omit<AudioStudioModalProps, "open">;

export function AudioStudioModal(props: AudioStudioModalProps) {
  if (!props.open) return null;

  return (
    <AudioStudioContent
      key={`${props.src}:${props.name}`}
      name={props.name}
      src={props.src}
      settings={props.settings}
      onClose={props.onClose}
      onSave={props.onSave}
    />
  );
}

function AudioStudioContent({ name, src, settings, onClose, onSave }: AudioStudioContentProps) {
  const [title, setTitle] = useState(name);
  const [volume, setVolume] = useState(settings.volume);
  const [trimStart, setTrimStart] = useState(settings.trimStart);
  const [trimEnd, setTrimEnd] = useState<number | null>(settings.trimEnd);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { peaks, duration, loading, error } = useAudioPeaks(src);

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

  useEffect(() => () => audioRef.current?.pause(), []);

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
      <section className="studio-modal" role="dialog" aria-modal="true" aria-labelledby="audio-studio-title" style={modalSectionStyle}>
        <div style={modalHeaderRow}>
          <div>
            <h2 id="audio-studio-title" style={modalTitleStyle}>Audio Canvas Studio</h2>
            <div style={{ marginTop: 4, color: "var(--fg-subtle)", fontSize: 11 }}>Cut and balance this track for the service timeline.</div>
          </div>
          <button type="button" onClick={onClose} title="Close" style={modalCloseButtonStyle}>×</button>
        </div>

        <audio
          ref={audioRef}
          src={src}
          preload="auto"
          onLoadedMetadata={(event) => {
            if (trimEnd == null) setTrimEnd(event.currentTarget.duration);
          }}
          style={{ display: "none" }}
        />

        <div style={studioWorkspaceStyle}>
          <div style={studioCanvasColumnStyle}>
            <label style={fieldLabelStyle}>Asset name<input value={title} onChange={(event) => setTitle(event.target.value)} style={fieldInputStyle} /></label>
            <div style={{ ...studioStageStyle, flex: 1, minHeight: 0, aspectRatio: "auto", padding: 18, boxSizing: "border-box" }}>
              <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 12 }}>
                <button type="button" onClick={togglePlay} title={isPlaying ? "Pause" : "Play"} style={playButtonStyle}>{isPlaying ? "Ⅱ" : "▶"}</button>
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
              </div>
              <div style={{ color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.05em" }}>WAVEFORM / TIMELINE</div>
          </div>
            <aside className="studio-scroll-pane" style={studioInspectorStyle}>
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
          </aside>
        </div>

        <div style={studioFooterStyle}>
          <span style={{ color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", fontSize: 10 }}>AUDIO ASSET</span>
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
