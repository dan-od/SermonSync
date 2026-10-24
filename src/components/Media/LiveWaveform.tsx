import { useEffect, useRef, type CSSProperties } from "react";
import { liveWaveformWindow } from "../../lib/liveWaveform";

interface LiveWaveformProps {
  minPeaks: number[];
  maxPeaks: number[];
  duration: number;
  currentTime: number;
  playing: boolean;
  getCurrentTime?: () => number;
  onSeek?: (time: number) => void;
  height?: number;
  style?: CSSProperties;
}

/** Signed, moving amplitude envelope. The center line represents zero amplitude. */
export function LiveWaveform({ minPeaks, maxPeaks, duration, currentTime, playing, getCurrentTime, onSeek, height = 180, style }: LiveWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const visibleWindowRef = useRef({ start: 0, end: duration });
  const drawRef = useRef<((clock: number) => void) | null>(null);
  const playbackRef = useRef({ currentTime, playing, getCurrentTime, anchorClock: 0 });

  useEffect(() => {
    const clock = performance.now();
    playbackRef.current = { currentTime, playing, getCurrentTime, anchorClock: clock };
    drawRef.current?.(clock);
  }, [currentTime, playing, getCurrentTime]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !duration || minPeaks.length === 0 || minPeaks.length !== maxPeaks.length) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const draw = (clock: number) => {
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, container.clientWidth);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      const playback = playbackRef.current;
      const actualTime = playback.getCurrentTime?.();
      const estimatedTime = playback.playing
        ? playback.currentTime + Math.max(0, clock - playback.anchorClock) / 1000
        : playback.currentTime;
      const time = Math.min(duration, Math.max(0, Number.isFinite(actualTime) ? actualTime! : estimatedTime));
      const { start, end } = liveWaveformWindow(duration, time);
      visibleWindowRef.current = { start, end };
      const span = end - start;
      if (span <= 0) return;

      const center = height / 2;
      const amplitude = height * 0.43;
      context.fillStyle = "rgba(255,255,255,.28)";
      context.fillRect(0, center - 0.5, width, 1);
      const first = Math.max(0, Math.floor(start / duration * minPeaks.length));
      const last = Math.min(minPeaks.length - 1, Math.ceil(end / duration * minPeaks.length));
      const bucketWidth = width * duration / (span * minPeaks.length);
      for (let index = first; index <= last; index += 1) {
        const x = (index / minPeaks.length * duration - start) / span * width;
        if (x >= width || x + bucketWidth <= 0) continue;
        const high = Math.min(1, Math.max(0, maxPeaks[index]));
        const low = Math.max(-1, Math.min(0, minPeaks[index]));
        const top = center - high * amplitude;
        const bottom = center - low * amplitude;
        context.fillStyle = index / minPeaks.length * duration <= time ? "#56d6b0" : "rgba(255,255,255,.65)";
        context.fillRect(Math.max(0, x), top, Math.max(1, bucketWidth - 1), Math.max(1, bottom - top));
      }
      const playheadX = Math.min(width, Math.max(0, (time - start) / span * width));
      context.fillStyle = "#fff";
      context.fillRect(playheadX - 1, 0, 2, height);
    };

    drawRef.current = draw;
    draw(performance.now());
    const observer = new ResizeObserver(() => draw(performance.now()));
    observer.observe(container);
    return () => {
      observer.disconnect();
      drawRef.current = null;
    };
  }, [duration, height, maxPeaks, minPeaks]);

  useEffect(() => {
    if (!playing || !drawRef.current || typeof requestAnimationFrame !== "function") return;
    let frame = 0;
    let lastDraw = -Infinity;
    const animate = (clock: number) => {
      if (clock - lastDraw >= 30) {
        drawRef.current?.(clock);
        lastDraw = clock;
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [duration, height, maxPeaks, minPeaks, playing]);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const { start, end } = visibleWindowRef.current;
    onSeek(start + Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * (end - start));
  };

  return <div ref={containerRef} onClick={handleClick} style={{ width: "100%", height, cursor: onSeek ? "pointer" : "default", ...style }}>
    <canvas ref={canvasRef} style={{ display: "block" }} aria-label="Live audio waveform" />
  </div>;
}
