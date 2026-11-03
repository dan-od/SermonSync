import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { fadeTransition } from "../../lib/transitions";
import { ResilientImage } from "../ResilientImage";
import { ResilientVideo } from "../ResilientVideo";
import type { ProjectorAudioProgress, ProjectorMedia, ProjectorPlaybackState, TransitionSetting } from "../../types/state";
import { ProjectedAudioLayer } from "./ProjectedAudioLayer";

export interface PreparedMedia {
  media: ProjectorMedia;
  source: string;
  key: string;
}

function PreparedMediaLayer({ entry, visible, preparing, outgoing, playing, loop, audioEnabled, muted, audioOwner, outputProgress, audioPeaks, audioMinPeaks, audioMaxPeaks, audioDuration, audioLoading, audioError, onReady, onVideoElementChange, onAudioElementChange, onPlaybackChange, onSeek, onAudioProgress }: {
  entry: PreparedMedia;
  visible: boolean;
  preparing: boolean;
  outgoing: boolean;
  playing: boolean;
  loop: boolean;
  audioEnabled: boolean;
  muted: boolean;
  audioOwner: "live" | "preview";
  outputProgress?: ProjectorAudioProgress | null;
  audioPeaks: number[];
  audioMinPeaks: number[];
  audioMaxPeaks: number[];
  audioDuration: number;
  audioLoading: boolean;
  audioError: string | null;
  onReady: () => void;
  onVideoElementChange: (video: HTMLVideoElement | null, removedVideo?: HTMLVideoElement) => void;
  onAudioElementChange: (audio: HTMLAudioElement | null, removedAudio?: HTMLAudioElement) => void;
  onPlaybackChange?: (patch: Partial<Pick<ProjectorPlaybackState, "playing" | "looping">>) => void;
  onSeek?: (time: number) => void;
  onAudioProgress: (time: number, duration: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const visibleRef = useRef(visible);
  useLayoutEffect(() => { visibleRef.current = visible; }, [visible]);
  const captureVideo = useCallback((video: HTMLVideoElement | null, removedVideo?: HTMLVideoElement) => {
    if (!video && removedVideo && videoRef.current !== removedVideo) return;
    videoRef.current = video;
    if (visibleRef.current) onVideoElementChange(video, removedVideo);
  }, [onVideoElementChange]);

  useLayoutEffect(() => {
    if (visible && entry.media.category === "videos") onVideoElementChange(videoRef.current);
  }, [entry.media.category, onVideoElementChange, visible]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const captureAudio = useCallback((audio: HTMLAudioElement | null, removedAudio?: HTMLAudioElement) => {
    if (!audio && removedAudio && audioRef.current !== removedAudio) return;
    audioRef.current = audio;
    if (visibleRef.current) onAudioElementChange(audio, removedAudio);
  }, [onAudioElementChange]);

  useLayoutEffect(() => {
    if (visible && entry.media.category === "audio") onAudioElementChange(audioRef.current);
  }, [entry.media.category, onAudioElementChange, visible]);

  return (
    <div
      data-projector-media-layer={preparing ? "preparing" : outgoing ? "outgoing" : "visible"}
      data-media-path={entry.media.path}
      style={{ position: "absolute", inset: 0, zIndex: preparing ? 0 : outgoing ? 0 : 1, opacity: preparing ? 0.001 : 1, pointerEvents: "none" }}
    >
      {entry.media.category === "videos" ? (
        <ResilientVideo
          media={{ type: "video", src: entry.source, fit: entry.media.fit, loop: true, x: 0, y: 0, width: 100, height: 100, opacity: entry.media.opacity, muted: true, speed: 1 }}
          sourcePath={entry.media.path}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: entry.media.fit, opacity: entry.media.opacity }}
          autoPlay
          playing={playing}
          loop={loop}
          preload="auto"
          onReady={preparing ? onReady : undefined}
          presentationVisible={visible}
          onVideoElementChange={captureVideo}
        />
      ) : entry.media.category === "audio" ? (
        <ProjectedAudioLayer entry={entry} visible={visible} playing={playing} loop={loop} enabled={audioEnabled} muted={muted} owner={audioOwner} outputProgress={outputProgress} peaks={audioPeaks} minPeaks={audioMinPeaks} maxPeaks={audioMaxPeaks} waveformDuration={audioDuration} loading={audioLoading} error={audioError} onReady={preparing ? onReady : () => undefined} onAudioElementChange={captureAudio} onPlaybackChange={onPlaybackChange} onSeek={onSeek} onProgress={onAudioProgress} />
      ) : (
        <ResilientImage src={entry.source} sourcePath={entry.media.path} alt={entry.media.name} onLoad={preparing ? onReady : undefined} onUnavailable={preparing ? onReady : undefined} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: entry.media.fit, opacity: entry.media.opacity }} />
      )}
    </div>
  );
}

/** Decode the incoming media behind the current frame, then reveal it. */
export function PreparedMediaHandoff({ media, source, hidden, clearTransition, playing, loop, audioEnabled, muted, audioOwner, outputProgress, audioPeaks, audioMinPeaks, audioMaxPeaks, audioDuration, audioLoading, audioError, onVideoElementChange, onAudioElementChange, onPlaybackChange, onSeek, onAudioProgress, onForegroundReady, retain }: {
  media: ProjectorMedia | null;
  source: string;
  hidden: boolean;
  clearTransition?: TransitionSetting;
  playing: boolean;
  loop: boolean;
  audioEnabled: boolean;
  muted: boolean;
  audioOwner: "live" | "preview";
  outputProgress?: ProjectorAudioProgress | null;
  audioPeaks: number[];
  audioMinPeaks: number[];
  audioMaxPeaks: number[];
  audioDuration: number;
  audioLoading: boolean;
  audioError: string | null;
  onVideoElementChange: (video: HTMLVideoElement | null, removedVideo?: HTMLVideoElement) => void;
  onAudioElementChange: (audio: HTMLAudioElement | null, removedAudio?: HTMLAudioElement) => void;
  onPlaybackChange?: (patch: Partial<Pick<ProjectorPlaybackState, "playing" | "looping">>) => void;
  onSeek?: (time: number) => void;
  onAudioProgress: (time: number, duration: number) => void;
  onForegroundReady: () => void;
  retain: boolean;
}) {
  const target = useMemo<PreparedMedia | null>(() => media && source ? ({ media, source, key: `${media.category}:${source}` }) : null, [media, source]);
  const [displayed, setDisplayed] = useState<PreparedMedia | null>(null);
  const [outgoing, setOutgoing] = useState<PreparedMedia | null>(null);
  const shown = target && displayed?.key === target.key ? target : displayed;
  const pending = target && shown?.key !== target.key ? target : null;

  const reveal = useCallback(() => {
    if (!pending) return;
    setOutgoing(shown);
    setDisplayed(pending);
    onForegroundReady();
  }, [onForegroundReady, pending, shown]);

  useEffect(() => {
    if (target && !pending) onForegroundReady();
  }, [onForegroundReady, pending, target]);

  useEffect(() => {
    if (!outgoing) return;
    const timeout = window.setTimeout(() => setOutgoing(null), 180);
    return () => window.clearTimeout(timeout);
  }, [outgoing]);

  useEffect(() => {
    if (retain || (!displayed && !outgoing)) return;
    const timeout = window.setTimeout(() => {
      setDisplayed(null);
      setOutgoing(null);
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [displayed, outgoing, retain]);

  const entries = [outgoing, shown, pending].filter((entry, index, all): entry is PreparedMedia =>
    entry !== null && all.findIndex((candidate) => candidate?.key === entry.key) === index,
  );

  if (entries.length === 0) return null;

  return (
    <div data-projector-media="" aria-hidden={hidden} style={{ position: "absolute", inset: 0, opacity: hidden ? 0 : 1, transition: fadeTransition(clearTransition) }}>
      {entries.map((entry) => (
        <PreparedMediaLayer
          key={entry.key}
          entry={entry}
          visible={entry.key === shown?.key && entry.key !== pending?.key}
          preparing={entry.key === pending?.key}
          outgoing={entry.key === outgoing?.key}
          playing={playing}
          loop={loop}
          audioEnabled={audioEnabled && entry.key === target?.key}
          muted={muted}
          audioOwner={audioOwner}
          outputProgress={outputProgress}
          audioPeaks={audioPeaks}
          audioMinPeaks={audioMinPeaks}
          audioMaxPeaks={audioMaxPeaks}
          audioDuration={audioDuration}
          audioLoading={audioLoading}
          audioError={audioError}
          onReady={reveal}
          onVideoElementChange={onVideoElementChange}
          onAudioElementChange={onAudioElementChange}
          onPlaybackChange={onPlaybackChange}
          onSeek={onSeek}
          onAudioProgress={onAudioProgress}
        />
      ))}
    </div>
  );
}
