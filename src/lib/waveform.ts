import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

let sharedAudioContext: AudioContext | null = null;
const BASE_BUCKETS = 512;
const MAX_DETAIL_BUCKETS = 24_000;
const MAX_CACHED_WAVEFORMS = 32;
const MAX_BROWSER_AUDIO_BYTES = 20 * 1024 * 1024;
interface WaveformData { peaks: number[]; minPeaks: number[]; maxPeaks: number[]; duration: number }
const waveformCache = new Map<string, Promise<WaveformData>>();

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
  const contentLength = Number(response.headers?.get("content-length") ?? 0);
  if (contentLength > MAX_BROWSER_AUDIO_BYTES) throw new Error("Waveform requires the desktop app for this large audio file.");
  let arrayBuffer: ArrayBuffer;
  if (response.body) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BROWSER_AUDIO_BYTES) {
        await reader.cancel();
        throw new Error("Waveform requires the desktop app for this large audio file.");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    arrayBuffer = bytes.buffer;
  } else {
    arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_BROWSER_AUDIO_BYTES) throw new Error("Waveform requires the desktop app for this large audio file.");
  }
  const ctx = getAudioContext();
  return new Promise((resolve, reject) => {
    ctx.decodeAudioData(arrayBuffer, resolve, (error) => reject(error ?? new Error("Failed to decode audio.")));
  });
}

function computeBrowserWaveform(buffer: AudioBuffer): WaveformData {
  const samples = buffer.getChannelData(0);
  const buckets = Math.min(MAX_DETAIL_BUCKETS, Math.max(BASE_BUCKETS, Math.ceil(buffer.duration * 20)));
  const minPeaks = Array<number>(buckets).fill(0);
  const maxPeaks = Array<number>(buckets).fill(0);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (!Number.isFinite(sample)) continue;
    const bucket = Math.min(buckets - 1, Math.floor(index * buckets / samples.length));
    minPeaks[bucket] = Math.min(minPeaks[bucket], sample);
    maxPeaks[bucket] = Math.max(maxPeaks[bucket], sample);
  }
  const peaks = Array<number>(BASE_BUCKETS).fill(0);
  for (let index = 0; index < buckets; index += 1) {
    const bucket = Math.min(BASE_BUCKETS - 1, Math.floor(index * BASE_BUCKETS / buckets));
    peaks[bucket] = Math.max(peaks[bucket], -minPeaks[index], maxPeaks[index]);
  }
  return { peaks, minPeaks, maxPeaks, duration: buffer.duration };
}

function fitPeaks(peaks: number[], buckets: number): number[] {
  if (peaks.length <= buckets) return peaks;
  return Array.from({ length: buckets }, (_, index) => {
    const start = Math.floor((index * peaks.length) / buckets);
    const end = Math.max(start + 1, Math.ceil(((index + 1) * peaks.length) / buckets));
    let peak = 0;
    for (let sample = start; sample < end; sample += 1) peak = Math.max(peak, peaks[sample] ?? 0);
    return peak;
  });
}

function loadWaveform(src: string, sourcePath?: string): Promise<WaveformData> {
  const key = sourcePath ?? src;
  const cached = waveformCache.get(key);
  if (cached) return cached;

  const native = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window && Boolean(sourcePath);
  const pending: Promise<WaveformData> = (native
    ? invoke<WaveformData>("get_audio_waveform", { path: sourcePath })
    : decodeAudioFile(src).then(computeBrowserWaveform))
    .catch((error: unknown) => {
      if (waveformCache.get(key) === pending) waveformCache.delete(key);
      throw error;
    });
  waveformCache.set(key, pending);
  if (waveformCache.size > MAX_CACHED_WAVEFORMS) {
    const oldest = waveformCache.keys().next().value;
    if (oldest !== undefined && oldest !== key) waveformCache.delete(oldest);
  }
  return pending;
}

interface AudioPeaksState {
  peaks: number[];
  minPeaks: number[];
  maxPeaks: number[];
  duration: number;
  loading: boolean;
  error: string | null;
}

interface AudioPeaksResult extends AudioPeaksState {
  src: string;
  buckets: number;
}

const EMPTY_AUDIO_PEAKS: AudioPeaksState = { peaks: [], minPeaks: [], maxPeaks: [], duration: 0, loading: false, error: null };
const LOADING_AUDIO_PEAKS: AudioPeaksState = { peaks: [], minPeaks: [], maxPeaks: [], duration: 0, loading: true, error: null };

/** Uses native bounded decoding in Tauri; small browser previews share a cached decode. */
export function useAudioPeaks(src: string | null, buckets = 220, sourcePath?: string): AudioPeaksState {
  const [result, setResult] = useState<AudioPeaksResult | null>(null);

  useEffect(() => {
    if (!src) return;

    let cancelled = false;
    loadWaveform(src, sourcePath)
      .then((waveform) => {
        if (cancelled) return;
        setResult({ src, buckets, peaks: fitPeaks(waveform.peaks, buckets), minPeaks: waveform.minPeaks ?? [], maxPeaks: waveform.maxPeaks ?? [], duration: waveform.duration, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setResult({ src, buckets, peaks: [], minPeaks: [], maxPeaks: [], duration: 0, loading: false, error: error instanceof Error ? error.message : "Failed to decode audio." });
      });
    return () => {
      cancelled = true;
    };
  }, [src, buckets, sourcePath]);

  if (!src) return EMPTY_AUDIO_PEAKS;
  if (!result || result.src !== src || result.buckets !== buckets) return LOADING_AUDIO_PEAKS;
  return result;
}
