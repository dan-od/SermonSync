// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMicMuteDetection } from "../micMuteDetection";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ capturing, rms }: { capturing: boolean; rms: number }) {
  const muted = useMicMuteDetection(capturing, rms, rms);
  return <span>{muted ? "muted" : "receiving"}</span>;
}

describe("useMicMuteDetection", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("reports sustained silence and clears the warning when audio resumes", () => {
    act(() => root.render(<Probe capturing rms={0} />));
    act(() => vi.advanceTimersByTime(3500));
    expect(container.textContent).toBe("muted");

    act(() => root.render(<Probe capturing rms={0.1} />));
    act(() => vi.advanceTimersByTime(0));
    expect(container.textContent).toBe("receiving");
  });
});
