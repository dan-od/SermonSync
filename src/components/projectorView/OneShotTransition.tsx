import { useState, type CSSProperties, type ReactNode } from "react";

/** An entrance runs once for its mounted content, even if settings or other views rerender. */
export function OneShotTransition({ animationStyle, style, children }: { animationStyle?: CSSProperties; style?: CSSProperties; children: ReactNode }) {
  const [initialAnimationStyle] = useState(animationStyle);
  const [finished, setFinished] = useState(false);
  return (
    <div
      style={{ ...style, ...initialAnimationStyle, ...(finished ? { animation: "none", filter: "none", willChange: "auto" } : null) }}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) setFinished(true);
      }}
    >
      {children}
    </div>
  );
}
