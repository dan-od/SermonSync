import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import type { LaunchWaveHandle } from "./LaunchWave";
import {
  FLOOR_MS,
  LAUNCH_EASE,
  LAUNCH_MARKS,
  READY_GRACE_MS,
  SKIP_DELAY_MS,
  type LaunchMarkAction,
} from "./launchConstants";

export interface LaunchTimelineOptions {
  /** `performance.now()` when the engine reported ready, else undefined. */
  readyAt: number | undefined;
  /** A failure holds the sequence here: never hand a dead engine to the app. */
  blocked: boolean;
  reduced: boolean;
  waveRef: RefObject<LaunchWaveHandle | null>;
  /** Called once the console curtain has settled. */
  onComplete: () => void;
}

export interface LaunchTimeline {
  glowRef: RefObject<HTMLDivElement | null>;
  wordmarkRef: RefObject<HTMLDivElement | null>;
  taglineRef: RefObject<HTMLDivElement | null>;
  bootRef: RefObject<HTMLDivElement | null>;
  footRef: RefObject<HTMLDivElement | null>;
  skipRef: RefObject<HTMLButtonElement | null>;
  appInRef: RefObject<HTMLDivElement | null>;
  /** Exit now, from the skip pill. */
  skip: () => void;
}

/** `prefers-reduced-motion`, watched so a change mid-sequence is honoured. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

const toKebab = (property: string) => property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * The launch sequence: one `requestAnimationFrame` loop firing absolute beat
 * marks against `performance.now()`.
 *
 * Absolute marks rather than chained `setTimeout`s, because a frame lost to the
 * sidecar's model load must not push the whole sequence back — a late frame
 * fires every mark it passed and carries on.
 *
 * The exit gate is `max(FLOOR_MS, readyAt + READY_GRACE_MS)`: a fast engine
 * cannot cut the sequence short, a slow one holds it at the settled frame.
 */
export function useLaunchTimeline({
  readyAt,
  blocked,
  reduced,
  waveRef,
  onComplete,
}: LaunchTimelineOptions): LaunchTimeline {
  const glowRef = useRef<HTMLDivElement | null>(null);
  const wordmarkRef = useRef<HTMLDivElement | null>(null);
  const taglineRef = useRef<HTMLDivElement | null>(null);
  const bootRef = useRef<HTMLDivElement | null>(null);
  const footRef = useRef<HTMLDivElement | null>(null);
  const skipRef = useRef<HTMLButtonElement | null>(null);
  const appInRef = useRef<HTMLDivElement | null>(null);

  // Live values the loop reads, so the loop itself is mounted once.
  const readyAtRef = useRef(readyAt);
  const blockedRef = useRef(blocked);
  const reducedRef = useRef(reduced);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    readyAtRef.current = readyAt;
    blockedRef.current = blocked;
    reducedRef.current = reduced;
    onCompleteRef.current = onComplete;
  });

  const exitRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const startAt = performance.now();
    const timers: number[] = [];
    let raf = 0;
    let fired = 0;
    let skipShown = false;
    let exited = false;

    const after = (ms: number, run: () => void) => timers.push(window.setTimeout(run, ms));

    /**
     * Transition `props` onto `el`. Under reduced motion only opacity is
     * animated: blur and travel are applied in the same frame, so the beats
     * keep their timings and nothing moves.
     */
    const tr = (el: HTMLElement | null, props: Record<string, string>, ms = 600) => {
      if (!el) return;
      const keys = Object.keys(props);
      const animated = reducedRef.current ? keys.filter((key) => key === "opacity") : keys;
      el.style.transition = animated.map((key) => `${toKebab(key)} ${ms}ms ${LAUNCH_EASE}`).join(",");
      requestAnimationFrame(() => Object.assign(el.style, props));
    };

    // Reduced motion: settle the entrance offsets up front so the fades below
    // have nothing spatial left to do.
    if (reducedRef.current) {
      if (wordmarkRef.current) {
        wordmarkRef.current.style.filter = "none";
        wordmarkRef.current.style.transform = "none";
      }
      if (taglineRef.current) taglineRef.current.style.transform = "none";
      if (appInRef.current) appInRef.current.style.transform = "none";
    }

    const showSkip = () => {
      skipRef.current?.classList.add("is-visible");
      tr(skipRef.current, { opacity: "1" }, 400);
    };

    const runMark = (action: LaunchMarkAction) => {
      switch (action) {
        case "sound":
          // 0.40 — the line starts to carry a waveform, as if a mic opened.
          waveRef.current?.setTargetAmp(1);
          tr(glowRef.current, { opacity: "1" }, 1400);
          return;
        case "wordmark":
          // 1.10 — resolves out of blur and rises 8px.
          tr(
            wordmarkRef.current,
            { opacity: "1", filter: "blur(0px)", transform: "translateY(0px)" },
            900,
          );
          return;
        case "tagline":
          // 1.70 — one line, fixed.
          tr(taglineRef.current, { opacity: "1", transform: "translateY(0px)" }, 700);
          return;
        case "boot":
          // 1.90 — the real steps, in order.
          tr(bootRef.current, { opacity: "1" }, 500);
          return;
        case "stamp":
          // 3.60 — the frame that stays if the engine is slow.
          tr(footRef.current, { opacity: "1" }, 700);
          return;
      }
    };

    const exit = () => {
      if (exited) return;
      exited = true;
      // The wave settles back to a flat line: sound handed off to the app.
      waveRef.current?.setTargetAmp(0);
      tr(glowRef.current, { opacity: "0" }, 500);
      tr(wordmarkRef.current, { opacity: "0", transform: "translateY(-6px)" }, 450);
      tr(taglineRef.current, { opacity: "0" }, 300);
      tr(bootRef.current, { opacity: "0" }, 300);
      tr(footRef.current, { opacity: "0" }, 300);
      tr(skipRef.current, { opacity: "0" }, 200);
      skipRef.current?.classList.remove("is-visible");
      after(380, () => {
        tr(appInRef.current, { opacity: "1", transform: "translateY(0px)" }, 500);
        after(500, () => onCompleteRef.current());
      });
    };
    exitRef.current = exit;

    const loop = () => {
      const elapsed = performance.now() - startAt;

      // Fire every mark whose time has passed, so a late frame catches up
      // instead of shifting the sequence.
      while (fired < LAUNCH_MARKS.length && LAUNCH_MARKS[fired].at <= elapsed) {
        runMark(LAUNCH_MARKS[fired].action);
        fired += 1;
      }

      // Skip once the operator has waited long enough, or straight away on a
      // failure, so nobody is trapped behind a dead engine.
      if (!skipShown && !exited && (elapsed >= SKIP_DELAY_MS || blockedRef.current)) {
        skipShown = true;
        showSkip();
      }

      if (!exited && !blockedRef.current && readyAtRef.current !== undefined) {
        const exitAt = Math.max(FLOOR_MS, readyAtRef.current - startAt + READY_GRACE_MS);
        if (elapsed >= exitAt) exit();
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(window.clearTimeout);
    };
  }, [waveRef]);

  const skip = useCallback(() => exitRef.current(), []);

  return { glowRef, wordmarkRef, taglineRef, bootRef, footRef, skipRef, appInRef, skip };
}
