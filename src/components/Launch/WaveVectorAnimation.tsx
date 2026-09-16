import { useEffect, useRef } from "react";

interface WaveVectorAnimationProps {
  speed?: number;
  glowIntensity?: number;
  strandCount?: number;
  glowColor?: string;
  isTransitioning?: boolean;
}

/**
 * Interactive braided wave canvas animation. Framework-agnostic (plain
 * canvas 2D), ported as-is minus Tailwind class names.
 */
export function WaveVectorAnimation({
  speed = 1.0,
  glowIntensity = 1.0,
  strandCount = 6,
  glowColor = "#7b2ff7",
  isTransitioning = false,
}: WaveVectorAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const timeRef = useRef<number>(0);
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let width = (canvas.width = canvas.parentElement?.clientWidth || 900);
    let height = (canvas.height = canvas.parentElement?.clientHeight || 220);

    const handleResize = () => {
      if (!canvas.parentElement) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height || 220;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, active: true };
    };
    const handleMouseLeave = () => {
      mouseRef.current.active = false;
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);

    const numStrands = Math.max(4, Math.min(8, strandCount));
    const baseSpreads: number[] = [];
    const maxSpread = Math.min(height * 0.26, 92);
    for (let i = 0; i < numStrands; i++) {
      const norm = (i / (numStrands - 1)) * 2 - 1;
      baseSpreads.push(norm * maxSpread);
    }

    const strandTraits = baseSpreads.map((spread, i) => ({
      spread,
      phaseOffset: (i * Math.PI) / (numStrands / 2),
      freqMultiplier: 0.95 + (i % 3) * 0.25,
      amplitude: Math.min(height * 0.12, 38) + (i % 2) * 12,
    }));

    const render = () => {
      timeRef.current += 0.018 * speed;
      const t = timeRef.current;

      ctx.clearRect(0, 0, width, height);
      const centerY = height / 2;
      const step = 2.5;

      strandTraits.forEach((trait, strandIdx) => {
        ctx.save();
        ctx.beginPath();
        let isFirst = true;

        for (let x = 0; x <= width; x += step) {
          const normX = x / width;

          let centerBlend: number;
          if (normX < 0.28) {
            const p = normX / 0.28;
            centerBlend = Math.sin((p * Math.PI) / 2);
          } else if (normX > 0.72) {
            const p = (1 - normX) / 0.28;
            centerBlend = Math.sin((p * Math.PI) / 2);
          } else {
            centerBlend = 1.0;
          }

          const currentSpread = trait.spread * (1 - centerBlend * 0.78);
          const waveFreq = (0.026 + (width < 768 ? 0.012 : 0.006)) * trait.freqMultiplier;
          const centerEnvelope = Math.pow(Math.sin(normX * Math.PI), 1.35);
          const transFactor = isTransitioning ? 1.5 : 1.0;

          const wave1 = Math.sin(x * waveFreq + t * 1.6 + trait.phaseOffset) * trait.amplitude * centerEnvelope * transFactor;
          const wave2 = Math.cos(x * waveFreq * 1.5 - t * 1.1 + trait.phaseOffset * 0.7) * (trait.amplitude * 0.45) * centerEnvelope;

          let mousePerturb = 0;
          if (mouseRef.current.active) {
            const dx = x - mouseRef.current.x;
            const dist = Math.abs(dx);
            if (dist < 180) {
              const mouseFactor = Math.cos((dist / 180) * (Math.PI / 2));
              mousePerturb = Math.sin(t * 4 + strandIdx) * 24 * mouseFactor;
            }
          }

          const y = centerY + currentSpread + wave1 + wave2 + mousePerturb;

          if (isFirst) {
            ctx.moveTo(x, y);
            isFirst = false;
          } else {
            ctx.lineTo(x, y);
          }
        }

        const strokeGrad = ctx.createLinearGradient(0, centerY, width, centerY);
        strokeGrad.addColorStop(0.0, "rgba(255, 255, 255, 0.0)");
        strokeGrad.addColorStop(0.05, "rgba(255, 255, 255, 0.4)");
        strokeGrad.addColorStop(0.2, "rgba(255, 255, 255, 0.85)");
        strokeGrad.addColorStop(0.5, "rgba(255, 255, 255, 1.0)");
        strokeGrad.addColorStop(0.8, "rgba(255, 255, 255, 0.85)");
        strokeGrad.addColorStop(0.95, "rgba(255, 255, 255, 0.4)");
        strokeGrad.addColorStop(1.0, "rgba(255, 255, 255, 0.0)");

        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 18 * glowIntensity;
        ctx.strokeStyle = strokeGrad;
        ctx.lineWidth = 2.4;
        ctx.stroke();

        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur = 5 * glowIntensity;
        ctx.strokeStyle = strokeGrad;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.restore();
      });

      animFrameIdRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      window.removeEventListener("resize", handleResize);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [speed, glowIntensity, strandCount, glowColor, isTransitioning]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: 220,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block", cursor: "pointer", transition: "opacity 0.7s" }}
        title="Interactive wave vector: Move mouse to interact"
      />
    </div>
  );
}
