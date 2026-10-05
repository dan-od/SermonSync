import { useEffect, useRef, type CSSProperties } from "react";

function resolveColor(value: string): string {
  if (!value.startsWith("var(")) return value;
  const varName = value.slice(4, -1).split(",")[0].trim();
  const resolved = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return resolved || "#8888a0";
}

interface WaveformCanvasProps {
  peaks: number[];
  duration: number;
  currentTime?: number;
  trimStart?: number;
  trimEnd?: number | null;
  height?: number;
  onSeek?: (time: number) => void;
  barColor?: string;
  progressColor?: string;
  style?: CSSProperties;
}

/** Renders decoded audio peaks as a bar waveform with an optional playhead/trim overlay and click-to-seek. */
export function WaveformCanvas({
  peaks,
  duration,
  currentTime = 0,
  trimStart = 0,
  trimEnd = null,
  height = 64,
  onSeek,
  barColor = "var(--border-base)",
  progressColor = "var(--color-primary)",
  style,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = container.clientWidth || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (peaks.length === 0) return;

      const resolvedBarColor = resolveColor(barColor);
      const resolvedProgressColor = resolveColor(progressColor);
      const barWidth = Math.max(1, width / peaks.length);
      const gap = barWidth > 3 ? 1 : 0;
      const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
      const trimStartRatio = duration > 0 ? Math.min(1, Math.max(0, trimStart / duration)) : 0;
      const trimEndRatio = duration > 0 && trimEnd != null ? Math.min(1, Math.max(0, trimEnd / duration)) : 1;

      peaks.forEach((peak, index) => {
        const ratio = index / peaks.length;
        const x = index * barWidth;
        const barHeight = Math.max(2, peak * height);
        const y = (height - barHeight) / 2;
        const inTrim = ratio >= trimStartRatio && ratio <= trimEndRatio;
        ctx.fillStyle = ratio <= progress ? resolvedProgressColor : resolvedBarColor;
        ctx.globalAlpha = inTrim ? 1 : 0.25;
        ctx.fillRect(x, y, Math.max(1, barWidth - gap), barHeight);
      });
      ctx.globalAlpha = 1;
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(container);
    return () => observer.disconnect();
  }, [peaks, duration, currentTime, trimStart, trimEnd, height, barColor, progressColor]);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek || duration <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  };

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      style={{ width: "100%", height, cursor: onSeek ? "pointer" : "default", ...style }}
    >
      <canvas ref={canvasRef} style={{ display: "block" }} />
    </div>
  );
}
