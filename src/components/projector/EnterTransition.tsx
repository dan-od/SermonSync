import type { CSSProperties, ReactNode } from "react";
import { useEnterAnimation } from "./useEnterAnimation";
import type { TransitionSetting } from "../../types/state";

export function EnterTransition({ setting, trigger, style, children }: {
  setting?: TransitionSetting;
  trigger: unknown;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const ref = useEnterAnimation<HTMLDivElement>(setting, trigger);
  return <div ref={ref} style={style}>{children}</div>;
}
