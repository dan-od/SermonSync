import { useRef } from "react";

import { useConfigStore } from "../../stores";
import { LaunchBootStatus } from "./LaunchBootStatus";
import { LaunchWave, type LaunchWaveHandle } from "./LaunchWave";
import { BOOT_STEPS, LAUNCH_TAGLINE } from "./launchConstants";
import { useBootStatus } from "./useBootStatus";
import { useLaunchTimeline, usePrefersReducedMotion } from "./useLaunchTimeline";
import "./launch.css";

export interface LaunchScreenProps {
  /** Called once the console curtain has settled, to hand off to Auth. */
  onProceedToAuth: () => void;
}

/**
 * SS-076 launch screen: the boot sequence, played at real timing.
 *
 * One sequence with a start, a middle and an end, a 4.5s floor so it always
 * finishes its sentence, and status that is true — the rows are the sidecar's
 * own steps, not a timed fiction. If the engine is slow (a first model download
 * under SS-066 can take minutes) the screen holds at the settled frame and
 * offers Skip; if it dies, it says so and offers Retry.
 *
 * Ported from the "SermonSync Launch Motion" reference, whose class names and
 * timings it keeps.
 */
export function LaunchScreen({ onProceedToAuth }: LaunchScreenProps) {
  const waveRef = useRef<LaunchWaveHandle | null>(null);
  const reduced = usePrefersReducedMotion();
  const { steps, readyAt, error, retry, engineVersion } = useBootStatus();
  const unitId = useConfigStore((state) => state.unitId);

  const { glowRef, wordmarkRef, taglineRef, bootRef, footRef, skipRef, appInRef, skip } =
    useLaunchTimeline({
      readyAt,
      blocked: error !== undefined,
      reduced,
      waveRef,
      onComplete: onProceedToAuth,
    });

  const doneCount = steps.filter((step) => step.state === "done").length;
  const progress = Math.round((doneCount / BOOT_STEPS.length) * 100);

  return (
    <div className="ss-launch">
      <div className="stage">
        <div className="glow" ref={glowRef} />
        <LaunchWave ref={waveRef} reduced={reduced} />

        <div className="mark">
          <div className="wordmark" ref={wordmarkRef}>
            Sermon<span className="thin">Sync</span>
          </div>
          <div className="tagline" ref={taglineRef}>
            {LAUNCH_TAGLINE}
          </div>
        </div>

        <button type="button" className="skip" ref={skipRef} onClick={skip}>
          SKIP ›
        </button>

        <LaunchBootStatus ref={bootRef} steps={steps} />

        <div className="foot" ref={footRef}>
          <b>{unitId}</b>
          <br />
          engine v{engineVersion}
          <br />
          offline-first
        </div>

        <div className={error === undefined ? "retry" : "retry is-visible"} role="alert">
          <span>{error}</span>
          <button type="button" onClick={retry}>
            Retry
          </button>
        </div>

        <div className="line">
          <i style={{ width: `${progress}%` }} />
        </div>

        <div className="app-in" ref={appInRef} aria-hidden="true">
          <div className="hdr" />
          <i />
          <i />
          <i />
        </div>
      </div>
    </div>
  );
}
