import { useEffect, useState } from "react";

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!sharedAudioContext) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedAudioContext = new Ctor();
  }
  return sharedAudioContext;
}

async function decodeAudioFile(src: string): Promise<AudioBuffer> {
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Could not read audio file (${response.status}).`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const ctx = getAudioContext();
  return new Promise((resolve, reject) => {
    ctx.decodeAudioData(arrayBuffer.slice(0), resolve, (error) => reject(error ?? new Error("Failed to decode audio.")));
  });
}

function computePeaks(buffer: AudioBuffer, buckets: number): number[] {
  const channelData = buffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(channelData.length / buckets));
  const peaks: number[] = [];
  for (let i = 0; i < buckets; i += 1) {
    const start = i * blockSize;
    let max = 0;
    for (let j = 0; j < blockSize && start + j < channelData.length; j += 1) {
      const value = Math.abs(channelData[start + j]);
      if (value > max) max = value;
    }
    peaks.push(max);
  }
  return peaks;
}

interface AudioPeaksState {
  peaks: number[];
  duration: number;
  loading: boolean;
  error: string | null;
}

interface AudioPeaksResult extends AudioPeaksState {
  src: string;
  buckets: number;
}

const EMPTY_AUDIO_PEAKS: AudioPeaksState = { peaks: [], duration: 0, loading: false, error: null };
const LOADING_AUDIO_PEAKS: AudioPeaksState = { peaks: [], duration: 0, loading: true, error: null };

/** Decodes an audio file into normalized peak buckets for waveform rendering. */
export function useAudioPeaks(src: string | null, buckets = 220): AudioPeaksState {
  const [result, setResult] = useState<AudioPeaksResult | null>(null);

  useEffect(() => {
    if (!src) return;

    let cancelled = false;
    decodeAudioFile(src)
      .then((buffer) => {
        if (cancelled) return;
        setResult({ src, buckets, peaks: computePeaks(buffer, buckets), duration: buffer.duration, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setResult({ src, buckets, peaks: [], duration: 0, loading: false, error: error instanceof Error ? error.message : "Failed to decode audio." });
      });
    return () => {
      cancelled = true;
    };
  }, [src, buckets]);

  if (!src) return EMPTY_AUDIO_PEAKS;
  if (!result || result.src !== src || result.buckets !== buckets) return LOADING_AUDIO_PEAKS;
  return result;
}
