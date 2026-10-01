import type { TransitionSetting } from "../../types/state";

export function getTransitionAnimationName(transitionSetting: TransitionSetting | undefined) {
  if (!transitionSetting || transitionSetting.effect === "cut" || transitionSetting.durationMs === 0) {
    return "none";
  }
  switch (transitionSetting.effect) {
    case "fade":
    case "dissolve":
      return "projFadeIn";
    case "slide-left":
    case "push-left":
    case "wipe-left":
      return "projSlideLeft";
    case "slide-right":
    case "push-right":
    case "wipe-right":
      return "projSlideRight";
    case "slide-up":
      return "projSlideUp";
    case "slide-down":
      return "projSlideDown";
    case "push-up-crossfade":
      return "projPushUpCrossfade";
    case "zoom-in":
      return "projZoomIn";
    case "zoom-out":
      return "projZoomOut";
    default:
      return "projFadeIn";
  }
}

export function projectorKeyframesCss(transitionSetting: TransitionSetting | undefined) {
  return `
        @keyframes ssOnAirBlink {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.35;
          }
        }
        @keyframes projFadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes projFadeOut {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes projSlideLeft {
          0% { transform: translate3d(100%, 0, 0); opacity: ${transitionSetting?.crossfade ? 0.2 : 1}; }
          100% { transform: translate3d(0, 0, 0); opacity: 1; }
        }
        @keyframes projSlideRight {
          0% { transform: translate3d(-100%, 0, 0); opacity: ${transitionSetting?.crossfade ? 0.2 : 1}; }
          100% { transform: translate3d(0, 0, 0); opacity: 1; }
        }
        @keyframes projSlideUp {
          0% { transform: translate3d(0, 100%, 0); opacity: ${transitionSetting?.crossfade ? 0.2 : 1}; }
          100% { transform: translate3d(0, 0, 0); opacity: 1; }
        }
        @keyframes projSlideDown {
          0% { transform: translate3d(0, -100%, 0); opacity: ${transitionSetting?.crossfade ? 0.2 : 1}; }
          100% { transform: translate3d(0, 0, 0); opacity: 1; }
        }
        @keyframes projPushUpCrossfade {
          0% { transform: translate3d(0, 100%, 0); opacity: 0.2; }
          100% { transform: translate3d(0, 0, 0); opacity: 1; }
        }
        @keyframes projZoomIn {
          0% { transform: scale3d(0.65, 0.65, 1); opacity: 0; }
          100% { transform: scale3d(1, 1, 1); opacity: 1; }
        }
        @keyframes projZoomOut {
          0% { transform: scale3d(1.35, 1.35, 1); opacity: 0; }
          100% { transform: scale3d(1, 1, 1); opacity: 1; }
        }
      `;
}
