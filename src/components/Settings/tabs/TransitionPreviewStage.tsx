import type { TransitionSetting } from "../types";
import type { TransitionCategory } from "./transitionPresets";

export function TransitionPreviewStage({
  category,
  setting,
}: {
  category: TransitionCategory;
  setting: TransitionSetting;
}) {
  const cssEasing =
    setting.easing === "spring"
      ? "cubic-bezier(0.34, 1.56, 0.64, 1)"
      : setting.easing;

  const durationSec = setting.durationMs / 1000;
  const filterBlur = setting.motionBlur ? "blur(3px)" : "none";

  const getAnimation = () => {
    if (setting.effect === "cut" || setting.durationMs === 0) {
      return "none";
    }
    switch (setting.effect) {
      case "fade":
      case "dissolve":
        return `ssFadeIn ${durationSec}s ${cssEasing} forwards`;
      case "slide-left":
      case "push-left":
      case "wipe-left":
        return `ssSlideLeft ${durationSec}s ${cssEasing} forwards`;
      case "slide-right":
      case "push-right":
      case "wipe-right":
        return `ssSlideRight ${durationSec}s ${cssEasing} forwards`;
      case "slide-up":
        return `ssSlideUp ${durationSec}s ${cssEasing} forwards`;
      case "slide-down":
        return `ssSlideDown ${durationSec}s ${cssEasing} forwards`;
      case "push-up-crossfade":
        return `ssPushUpCrossfade ${durationSec}s ${cssEasing} forwards`;
      case "zoom-in":
        return `ssZoomIn ${durationSec}s ${cssEasing} forwards`;
      case "zoom-out":
        return `ssZoomOut ${durationSec}s ${cssEasing} forwards`;
      default:
        return `ssFadeIn ${durationSec}s ${cssEasing} forwards`;
    }
  };

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", display: "grid", placeItems: "center" }}>
      <style>{`
        @keyframes ssFadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes ssSlideLeft {
          0% { transform: translate3d(100%, 0, 0); opacity: ${setting.crossfade ? 0.3 : 1}; }
          100% { transform: translate3d(0, 0, 0); opacity: 1; }
        }
        @keyframes ssSlideRight {
          0% { transform: translate3d(-100%, 0, 0); opacity: ${setting.crossfade ? 0.3 : 1}; }
          100% { transform: translate3d(0, 0, 0); opacity: 1; }
        }
        @keyframes ssSlideUp {
          0% { transform: translate3d(0, 100%, 0); opacity: ${setting.crossfade ? 0.3 : 1}; }
          100% { transform: translate3d(0, 0, 0); opacity: 1; }
        }
        @keyframes ssSlideDown {
          0% { transform: translate3d(0, -100%, 0); opacity: ${setting.crossfade ? 0.3 : 1}; }
          100% { transform: translate3d(0, 0, 0); opacity: 1; }
        }
        @keyframes ssPushUpCrossfade {
          0% { transform: translate3d(0, 100%, 0); opacity: 0.3; }
          100% { transform: translate3d(0, 0, 0); opacity: 1; }
        }
        @keyframes ssZoomIn {
          0% { transform: scale3d(0.6, 0.6, 1); opacity: 0; }
          100% { transform: scale3d(1, 1, 1); opacity: 1; }
        }
        @keyframes ssZoomOut {
          0% { transform: scale3d(1.4, 1.4, 1); opacity: 0; }
          100% { transform: scale3d(1, 1, 1); opacity: 1; }
        }
      `}</style>

      {/* Stage Background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            category === "black"
              ? "#000"
              : category === "clear"
                ? "transparent"
                : "radial-gradient(circle at 50% 50%, rgba(123, 47, 247, 0.25), rgba(8, 9, 18, 0.95))",
        }}
      />

      {/* Animated Foreground Content */}
      <div
        style={{
          zIndex: 2,
          animation: getAnimation(),
          filter: filterBlur,
          willChange: "transform, opacity",
          WebkitBackfaceVisibility: "hidden",
          backfaceVisibility: "hidden",
          transformStyle: "preserve-3d",
          textAlign: "center",
          padding: "20px",
          color: "#ffffff",
        }}
      >
        {category === "scriptures" ? (
          <div>
            <div style={{ fontFamily: "Georgia, serif", fontSize: "16px", fontStyle: "italic", marginBottom: "8px" }}>
              "For God so loved the world that he gave his only begotten Son..."
            </div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "11px", fontWeight: 700, color: "var(--color-primary)" }}>
              John 3:16 (NKJV)
            </div>
          </div>
        ) : category === "songs" ? (
          <div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "15px", fontWeight: 700, marginBottom: "6px" }}>
              HOW GREAT IS OUR GOD
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", opacity: 0.8 }}>
              Sing with me how great is our God
            </div>
          </div>
        ) : category === "logo" ? (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 800, letterSpacing: "0.1em" }}>
            ❖ FOURSQUARE GOSPEL CHURCH
          </div>
        ) : category === "black" ? (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "#666" }}>
            [ BLACK OVERRIDE ACTIVE ]
          </div>
        ) : (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--fg-subtle)" }}>
            [ TEXT OVERLAY CLEARED ]
          </div>
        )}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: "6px",
          right: "10px",
          fontFamily: "var(--font-mono)",
          fontSize: "9px",
          color: "var(--fg-subtle)",
          background: "rgba(0,0,0,0.6)",
          padding: "2px 6px",
          borderRadius: "3px",
        }}
      >
        Effect: {setting.effect} ({setting.durationMs}ms)
      </div>
    </div>
  );
}
