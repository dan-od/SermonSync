import { useCallback, useEffect, useState } from "react";
import { audioPlaybackErrorMessage, getSharedAudioElement, getSharedAudioOwner, pauseSharedAudioPlayback, startSharedAudioPlayback } from "../../lib/audioPlayback";
import { useProjectorStore } from "../../stores/projectorStore";
import { WaveformCanvas } from "../Media/Waveform";
import { LiveWaveform } from "../Media/LiveWaveform";
import type { ProjectorAudioProgress, ProjectorPlaybackState } from "../../types/state";
import type { PreparedMedia } from "./PreparedMediaHandoff";

export function ProjectedAudioLayer({ entry, visible, playing, loop, enabled, muted, owner, outputProgress, peaks, minPeaks, maxPeaks, waveformDuration, loading, error, onReady, onAudioElementChange, onPlaybackChange, onSeek, onProgress }: {
  entry: PreparedMedia;
  visible: boolean;
  playing: boolean;
  loop: boolean;
  enabled: boolean;
  muted: boolean;
  owner: "live" | "preview";
  outputProgress?: ProjectorAudioProgress | null;
  peaks: number[];
  minPeaks: number[];
  maxPeaks: number[];
  waveformDuration: number;
  loading: boolean;
  error: string | null;
  onReady: () => void;
  onAudioElementChange: (audio: HTMLAudioElement | null, removedAudio?: HTMLAudioElement) => void;
  onPlaybackChange?: (patch: Partial<Pick<ProjectorPlaybackState, "playing" | "looping">>) => void;
  onSeek?: (time: number) => void;
  onProgress: (time: number, duration: number) => void;
}) {
  const trimStart = entry.media.audioSettings?.trimStart ?? 0;
  const trimEnd = entry.media.audioSettings?.trimEnd ?? null;
  const volume = Math.max(0, Math.min(1, entry.media.audioSettings?.volume ?? 1));
  const playbackError = entry.media.audioPlaybackError ?? null;
  const [currentTime, setCurrentTime] = useState(trimStart);
  const [elementDuration, setElementDuration] = useState(0);
  const [localPlaybackError, setLocalPlaybackError] = useState<string | null>(null);
  const syncedOutput = muted && outputProgress?.path === entry.media.path ? outputProgress : null;
  const displayTime = syncedOutput?.time ?? currentTime;
  const totalDuration = waveformDuration || syncedOutput?.duration || elementDuration;

  useEffect(() => onReady(), [onReady]);

  useEffect(() => {
    if (muted) return;

    const sharedAudio = getSharedAudioElement();
    if (!enabled || !playing) {
      if (sharedAudio.src === entry.source) pauseSharedAudioPlayback(owner);
      return;
    }
    if (!visible) return;

    const desiredLoop = loop && trimEnd == null;
    if (getSharedAudioOwner() === owner && sharedAudio.src === entry.source && !sharedAudio.paused && sharedAudio.volume === volume && sharedAudio.loop === desiredLoop) return;
    let active = true;
    void startSharedAudioPlayback(entry.source, { volume, trimStart, trimEnd, loop }, owner).then((started) => {
      if (!active || !started) return;
      setLocalPlaybackError(null);
      if (owner === "live") useProjectorStore.getState().setLiveAudioPlaybackError(entry.media.path, null);
    }).catch((playError: unknown) => {
      if (!active || getSharedAudioOwner() !== owner) return;
      const message = audioPlaybackErrorMessage(playError, sharedAudio);
      console.error(`[ProjectorView] audio playback failed for ${entry.media.name}: ${message}`, playError);
      setLocalPlaybackError(message);
      if (owner === "live") useProjectorStore.getState().setLiveAudioPlaybackError(entry.media.path, message);
      onPlaybackChange?.({ playing: false });
    });
    return () => { active = false; };
  }, [enabled, entry.media.name, entry.media.path, entry.source, loop, muted, onPlaybackChange, owner, playing, trimEnd, trimStart, visible, volume]);

  const seek = (time: number) => {
    if (getSharedAudioOwner() !== owner) return;
    const audio = muted ? null : getSharedAudioElement();
    if (!audio || !Number.isFinite(time)) return;
    seekAudioElement(audio, time);
    setCurrentTime(time);
    onSeek?.(time);
  };

  const syncAudio = useCallback((audio: HTMLAudioElement) => {
    if (getSharedAudioOwner() !== owner) return;
    const time = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const length = Number.isFinite(audio.duration) ? audio.duration : 0;
    setCurrentTime(time);
    setElementDuration(length);
    onProgress(time, length);
  }, [onProgress, owner]);

  const handleTimeUpdate = useCallback((audio: HTMLAudioElement) => {
    if (getSharedAudioOwner() !== owner) return;
    syncAudio(audio);
    if (trimEnd == null || audio.currentTime < trimEnd) return;
    if (loop) {
      audio.currentTime = trimStart;
      if (enabled && playing) void audio.play().catch(() => undefined);
    } else {
      audio.pause();
      onPlaybackChange?.({ playing: false });
    }
  }, [enabled, loop, onPlaybackChange, owner, playing, syncAudio, trimEnd, trimStart]);

  useEffect(() => {
    if (muted) return;
    const audio = getSharedAudioElement();
    if (visible && getSharedAudioOwner() === owner) onAudioElementChange(audio);
    const handleLoadedMetadata = () => {
      if (getSharedAudioOwner() !== owner) return;
      syncAudio(audio);
      if (audio.currentTime < trimStart || (trimEnd != null && audio.currentTime >= trimEnd)) {
        try { audio.currentTime = trimStart; } catch { /* Metadata may still be settling. */ }
      }
      onReady();
    };
    const handleDurationChange = () => syncAudio(audio);
    const handleTimeUpdateEvent = () => handleTimeUpdate(audio);
    const handleEnded = () => {
      if (getSharedAudioOwner() !== owner) return;
      if (loop) {
        audio.currentTime = trimStart;
        if (enabled && playing) void audio.play().catch(() => undefined);
      } else {
        onPlaybackChange?.({ playing: false });
      }
    };
    const handleError = () => {
      if (getSharedAudioOwner() !== owner) return;
      const message = audioPlaybackErrorMessage(audio.error, audio);
      setLocalPlaybackError(message);
      if (owner === "live") useProjectorStore.getState().setLiveAudioPlaybackError(entry.media.path, message);
      onPlaybackChange?.({ playing: false });
    };
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("timeupdate", handleTimeUpdateEvent);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("timeupdate", handleTimeUpdateEvent);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [enabled, entry.media.path, handleTimeUpdate, loop, muted, onAudioElementChange, onPlaybackChange, onReady, owner, playing, syncAudio, trimEnd, trimStart, visible]);

  return (
    <div data-projector-audio="" aria-label={`Audio track ${entry.media.name}`} style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3vh", padding: "8%", boxSizing: "border-box", color: "#fff", background: "#111" }}>
      <div style={{ width: "100%", maxWidth: 1500, color: "rgba(255,255,255,.86)", fontFamily: "var(--font-sans)", fontSize: "clamp(18px, 3vw, 42px)", fontWeight: 600, textAlign: "center", overflowWrap: "anywhere" }}>{entry.media.name}</div>
      {loading ? <div style={{ width: "100%", maxWidth: 1500, height: 180, display: "grid", placeItems: "center", color: "rgba(255,255,255,.55)", fontSize: 16 }}>Loading waveform...</div> : error ? <div role="status" style={{ color: "rgba(255,255,255,.65)", fontSize: 16 }}>Waveform unavailable</div> : (
        minPeaks.length > 0 && minPeaks.length === maxPeaks.length ? (
          <LiveWaveform minPeaks={minPeaks} maxPeaks={maxPeaks} duration={totalDuration} currentTime={displayTime} playing={playing} getCurrentTime={muted ? undefined : () => getSharedAudioOwner() === owner ? getSharedAudioElement().currentTime : currentTime} onSeek={muted ? undefined : seek} height={180} style={{ width: "100%", maxWidth: 1500 }} />
        ) : (
          <WaveformCanvas peaks={peaks} duration={totalDuration} currentTime={displayTime} trimStart={trimStart} trimEnd={trimEnd} height={180} barColor="rgba(255,255,255,.38)" progressColor="#56d6b0" onSeek={seek} style={{ width: "100%", maxWidth: 1500 }} />
        )
      )}
      <div style={{ color: "rgba(255,255,255,.58)", fontFamily: "var(--font-mono)", fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{formatMediaTime(displayTime)} / {formatMediaTime(totalDuration)}</div>
      {playbackError || localPlaybackError ? <div role="alert" style={{ maxWidth: 720, color: "#ffb3b3", fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "center", overflowWrap: "anywhere" }}>Playback failed: {playbackError ?? localPlaybackError}</div> : null}
    </div>
  );
}

function formatMediaTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const wholeSeconds = Math.floor(seconds);
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

function seekAudioElement(audio: HTMLAudioElement, time: number) {
  audio.currentTime = time;
}
