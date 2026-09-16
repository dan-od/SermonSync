import { useEffect, useState } from "react";

const INTRO_STATEMENTS = [
  "Turning spoken words into real-time scripture display on your church screen.",
  "Offline-first AI co-pilot: Moonshine STT listening live with 50ms latency.",
  "Zero internet required. Zero training needed. Free for every congregation.",
  "Auto-detecting Bible verses as the pastor preaches, projected with precision.",
];

/**
 * Looping typewriter statement carousel shown between the flipping title
 * and the wave animation.
 */
export function TypewriterIntro() {
  const [statementIdx, setStatementIdx] = useState(0);
  const [displayedText, setDisplayedText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [typingSpeed, setTypingSpeed] = useState(38);

  useEffect(() => {
    const currentStatement = INTRO_STATEMENTS[statementIdx];
    let timer: number;

    if (!isDeleting) {
      if (displayedText.length < currentStatement.length) {
        timer = window.setTimeout(() => {
          setDisplayedText(currentStatement.slice(0, displayedText.length + 1));
          setTypingSpeed(Math.floor(Math.random() * 25) + 25);
        }, typingSpeed);
      } else {
        timer = window.setTimeout(() => setIsDeleting(true), 3200);
      }
    } else if (displayedText.length > 0) {
      timer = window.setTimeout(() => {
        setDisplayedText(currentStatement.slice(0, displayedText.length - 1));
        setTypingSpeed(18);
      }, typingSpeed);
    } else {
      timer = window.setTimeout(() => {
        setIsDeleting(false);
        setStatementIdx((prev) => (prev + 1) % INTRO_STATEMENTS.length);
        setTypingSpeed(45);
      }, 0);
    }

    return () => window.clearTimeout(timer);
  }, [displayedText, isDeleting, statementIdx, typingSpeed]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        width: "100%",
      }}
    >
      <div
        style={{
          position: "relative",
          height: "3.6rem",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 16px",
          maxWidth: "48rem",
          margin: "0 auto",
        }}
      >
        <p
          style={{
            fontSize: "var(--text-lg)",
            fontWeight: 400,
            color: "rgba(232, 232, 240, 0.9)",
            letterSpacing: "-0.015em",
            lineHeight: 1.6,
            maxWidth: "100%",
            height: "3.6rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            userSelect: "none",
            textShadow: "0 0 20px rgba(123, 47, 247, 0.45)",
            margin: 0,
          }}
        >
          {displayedText}
          <span
            className="ss-launch-caret"
            style={{
              display: "inline-block",
              width: 2,
              height: "1.1em",
              marginLeft: 6,
              verticalAlign: "middle",
              background: "var(--color-primary)",
              boxShadow: "0 0 10px var(--color-primary)",
            }}
          />
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, opacity: 0.6 }}>
        {INTRO_STATEMENTS.map((_, i) => (
          <span
            key={i}
            style={{
              height: 4,
              borderRadius: "var(--radius-full)",
              width: statementIdx === i ? 20 : 6,
              background: statementIdx === i ? "var(--color-primary)" : "rgba(232, 232, 240, 0.2)",
              transition: "all 0.3s ease",
            }}
          />
        ))}
      </div>
    </div>
  );
}
