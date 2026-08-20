/**
 * Detects a hardware/OS-muted microphone: capture is active but the input
 * level stays pinned at (near) zero for longer than any normal speech pause.
 */
import { useEffect, useRef, useState } from "react";

const SILENCE_THRESHOLD = 0.0015;
const SUSTAINED_SILENCE_MS = 3000;
const CHECK_INTERVAL_MS = 500;

export function useMicMuteDetection(isCapturing: boolean, levelRms: number, levelPeak: number): boolean {
  const [isMuted, setIsMuted] = useState(false);
  const lastSoundAtRef = useRef(0);
  const captureStartedAtRef = useRef(0);

  useEffect(() => {
    if (!isCapturing) {
      setTimeout(() => setIsMuted(false), 0);
      return;
    }
    const now = Date.now();
    captureStartedAtRef.current = now;
    lastSoundAtRef.current = now;
    setTimeout(() => setIsMuted(false), 0);
  }, [isCapturing]);

  useEffect(() => {
    if (levelRms > SILENCE_THRESHOLD || levelPeak > SILENCE_THRESHOLD) {
      lastSoundAtRef.current = Date.now();
      setTimeout(() => setIsMuted(false), 0);
    }
  }, [levelRms, levelPeak]);

  useEffect(() => {
    if (!isCapturing) {
      return;
    }
    const id = setInterval(() => {
      const now = Date.now();
      const sinceCaptureStarted = now - captureStartedAtRef.current;
      const sinceLastSound = now - lastSoundAtRef.current;
      if (sinceCaptureStarted > SUSTAINED_SILENCE_MS && sinceLastSound > SUSTAINED_SILENCE_MS) {
        setIsMuted(true);
      }
    }, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isCapturing]);

  return isMuted;
}
