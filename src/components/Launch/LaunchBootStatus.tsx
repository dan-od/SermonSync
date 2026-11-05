import { forwardRef } from "react";

import type { BootStep } from "./launchConstants";

export interface LaunchBootStatusProps {
  steps: readonly BootStep[];
}

/**
 * The real boot state, bottom-left in mono: one row per sidecar step, the
 * active one pulsing, done ones green with the time they took.
 *
 * Nothing here is decorative — every state comes from `useBootStatus`, which
 * reads the sidecar. A fast engine just means the rows are already green by the
 * time the block fades in.
 */
export const LaunchBootStatus = forwardRef<HTMLDivElement, LaunchBootStatusProps>(
  function LaunchBootStatus({ steps }, ref) {
    return (
      <div className="boot" ref={ref} role="status" aria-live="polite">
        {steps.map((step) => (
          <div
            key={step.key}
            className={step.state === "pending" ? "row" : `row ${step.state}`}
            data-k={step.key}
          >
            <span className="dot" />
            <span>
              <span className="lbl">{step.label}</span> <span className="meta">{step.meta ?? ""}</span>
            </span>
          </div>
        ))}
      </div>
    );
  },
);
