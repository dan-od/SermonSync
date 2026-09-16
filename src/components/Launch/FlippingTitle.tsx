import { useEffect, useState } from "react";

interface FlippingTitleProps {
  text?: string;
}

/**
 * Horizontal character-flip title animation, looping every ~4.8s.
 * Ported from the intro reference with Tailwind/motion removed in favor of
 * plain inline styles + the shared `ss-launch-char-flip` keyframe.
 */
export function FlippingTitle({ text = "SermonSync" }: FlippingTitleProps) {
  const characters = text.split("");
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCycle((prev) => prev + 1);
    }, 4800);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        userSelect: "none",
        perspective: 1000,
      }}
    >
      {characters.map((char, index) => (
        <span
          key={`${char}-${index}-${cycle}`}
          style={{
            display: "inline-block",
            transformStyle: "preserve-3d",
            backfaceVisibility: "visible",
            animation: `ss-launch-char-flip 3.2s cubic-bezier(0.25, 1, 0.5, 1) ${index * 0.07}s both`,
          }}
        >
          {char}
        </span>
      ))}
    </div>
  );
}
