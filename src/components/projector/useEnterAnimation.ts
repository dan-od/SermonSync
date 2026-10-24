import { useLayoutEffect, useRef } from "react";
import { enterAnimation } from "../../lib/transitions";
import type { TransitionSetting } from "../../types/state";

/**
 * Plays a one-shot enter animation on mount and whenever `trigger` changes.
 * Uses the Web Animations API (opacity/transform only), so it runs on the
 * compositor with no React state, re-renders, or lingering styles.
 */
export function useEnterAnimation<T extends HTMLElement>(setting: TransitionSetting | undefined, trigger: unknown) {
  const ref = useRef<T>(null);
  const settingRef = useRef(setting);
  useLayoutEffect(() => {
    settingRef.current = setting;
  });

  useLayoutEffect(() => {
    const el = ref.current;
    const spec = enterAnimation(settingRef.current);
    if (!el || !spec || typeof el.animate !== "function") return;
    const animation = el.animate(spec.keyframes, spec.options);
    return () => animation.cancel();
  }, [trigger]);

  return ref;
}
