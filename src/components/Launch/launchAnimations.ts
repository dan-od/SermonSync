/**
 * Scoped keyframe animations for the Launch intro sequence.
 *
 * Rendered via an inline <style> tag (see LaunchScreen.tsx), following the
 * same pattern already used for `shellReset` in App.tsx, so no new global
 * CSS file is introduced and nothing here can leak into / override the
 * app's design tokens.
 */
export const launchKeyframes = `
  @keyframes ss-launch-orb-float {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(25px, -20px) scale(1.08); }
  }

  @keyframes ss-launch-orb-float-rev {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(-30px, 20px) scale(1.06); }
  }

  @keyframes ss-launch-glow-ring {
    0%, 100% { opacity: 0.25; transform: scale(1); }
    50% { opacity: 0.45; transform: scale(1.04); }
  }

  @keyframes ss-launch-text-glow {
    0%, 100% {
      text-shadow: 0 0 25px rgba(123, 47, 247, 0.4), 0 0 50px rgba(123, 47, 247, 0.2);
    }
    50% {
      text-shadow: 0 0 35px rgba(123, 47, 247, 0.7), 0 0 70px rgba(123, 47, 247, 0.35), 0 0 10px rgba(255, 255, 255, 0.5);
    }
  }

  @keyframes ss-launch-fade-up {
    from { opacity: 0; transform: translateY(12px); filter: blur(3px); }
    to { opacity: 1; transform: translateY(0); filter: blur(0); }
  }

  @keyframes ss-launch-fade-down {
    from { opacity: 0; transform: translateY(-18px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes ss-launch-char-flip {
    0% { transform: rotateY(90deg) scale(0.92); opacity: 0; filter: blur(4px); }
    22% { transform: rotateY(0deg) scale(1); opacity: 1; filter: blur(0); }
    65% { transform: rotateY(0deg) scale(1); opacity: 1; filter: blur(0); }
    85% { transform: rotateY(90deg) scale(0.92); opacity: 0; filter: blur(4px); }
    100% { transform: rotateY(0deg) scale(1); opacity: 1; filter: blur(0); }
  }

  @keyframes ss-launch-caret-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.15; }
  }

  @keyframes ss-launch-stream-ping {
    0% { transform: scale(1); opacity: 1; }
    75%, 100% { transform: scale(2); opacity: 0; }
  }

  @keyframes ss-launch-log-in {
    from { opacity: 0; transform: translateX(-6px); filter: blur(3px); }
    to { opacity: 1; transform: translateX(0); filter: blur(0); }
  }

  @keyframes ss-launch-screen-exit {
    from { opacity: 1; transform: scale(1); filter: blur(0); }
    to { opacity: 0; transform: scale(1.03); filter: blur(8px); }
  }

  .ss-launch-orb-a { animation: ss-launch-orb-float 12s ease-in-out infinite; }
  .ss-launch-orb-b { animation: ss-launch-orb-float-rev 15s ease-in-out infinite; }
  .ss-launch-glow-ring { animation: ss-launch-glow-ring 6s ease-in-out infinite; }
  .ss-launch-fade-up { animation: ss-launch-fade-up 0.6s ease-out both; }
  .ss-launch-fade-down { animation: ss-launch-fade-down 0.7s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .ss-launch-caret { animation: ss-launch-caret-pulse 1s steps(1) infinite; }
  .ss-launch-stream-dot { animation: ss-launch-stream-ping 1.4s cubic-bezier(0, 0, 0.2, 1) infinite; }
  .ss-launch-log-line { animation: ss-launch-log-in 0.25s ease-out both; }
  .ss-launch-exiting { animation: ss-launch-screen-exit 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
`;
