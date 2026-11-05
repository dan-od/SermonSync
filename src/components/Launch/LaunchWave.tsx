import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export interface LaunchWaveHandle {
  /** Amplitude the wave eases toward: 0 is the flat line, 1 is full voice. */
  setTargetAmp: (value: number) => void;
}

export interface LaunchWaveProps {
  /** Under reduced motion the shape is drawn once and then held still. */
  reduced: boolean;
}

/**
 * The launch wave: six strands under a Gaussian envelope, amplitude driven by
 * the sequence rather than by audio. This is the only canvas on the screen.
 *
 * Ported from `drawWave()` in the motion reference, constants included — the
 * frequencies and the 0.045 lerp are what make it read as a microphone opening
 * instead of a loading animation.
 */
export const LaunchWave = forwardRef<LaunchWaveHandle, LaunchWaveProps>(function LaunchWave(
  { reduced },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ampRef = useRef(0);
  const targetAmpRef = useRef(0);
  const reducedRef = useRef(reduced);

  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);

  useImperativeHandle(
    ref,
    () => ({
      setTargetAmp: (value: number) => {
        targetAmpRef.current = value;
      },
    }),
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // The canvas is laid out by CSS; the backing store follows the device
    // pixel ratio so the strands are not soft on a retina display.
    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();

    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => size());
    observer?.observe(canvas);

    let raf = 0;
    let t = 0;
    const strands = 6;

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ampRef.current += (targetAmpRef.current - ampRef.current) * 0.045;
      t += reducedRef.current ? 0 : 0.016;
      const amp = ampRef.current;
      const cy = h * 0.55;

      for (let s = 0; s < strands; s++) {
        const phase = s * 0.9;
        const f1 = 0.011 + s * 0.0012;
        const f2 = 0.021 - s * 0.0009;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 3) {
          const env = Math.exp(-Math.pow((x - w / 2) / (w * 0.26), 2));
          const y =
            cy +
            env *
              amp *
              h *
              0.11 *
              (Math.sin(x * f1 + t * 1.3 + phase) + 0.6 * Math.sin(x * f2 - t * 1.9 + phase * 1.7));
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        const a = 0.18 + 0.5 * (1 - s / strands);
        ctx.strokeStyle = `rgba(${s % 2 ? "214,196,255" : "123,47,247"},${Math.min(1, a * (0.25 + amp))})`;
        ctx.lineWidth = s === 0 ? 1.6 : 1;
        ctx.shadowColor = "rgba(123,47,247,0.55)";
        ctx.shadowBlur = 10 * amp;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, []);

  return <canvas className="wave" ref={canvasRef} aria-hidden="true" />;
});
