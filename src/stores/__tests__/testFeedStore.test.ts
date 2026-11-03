import { beforeEach, describe, expect, it } from "vitest";

import { dispatchSidecarEvent } from "../../lib/sidecarWs";
import { formatFeedPosition, isTestFeedActive, useTestFeedStore } from "../testFeedStore";

const event = {
  type: "test_feed" as const,
  state: "playing" as const,
  title: "Sunday service",
  source: "https://youtu.be/x",
  position: 754.6,
  start: 600,
  end: 1200,
  speed: 1,
};

describe("test feed store (SS-072)", () => {
  beforeEach(() => {
    useTestFeedStore.setState({ enabled: false, status: null, duration: null, markers: [] });
  });

  it("follows test_feed events from the sidecar", () => {
    dispatchSidecarEvent(event);
    expect(useTestFeedStore.getState().status?.title).toBe("Sunday service");
    expect(isTestFeedActive(useTestFeedStore.getState().status)).toBe(true);

    dispatchSidecarEvent({ ...event, state: "stopped" });
    expect(isTestFeedActive(useTestFeedStore.getState().status)).toBe(false);
  });

  it("tracks duration and detected markers from status updates (SS-075)", () => {
    const markers = [{ time: 41.2, reference: "John 3:16", confidence: 0.991 }];
    dispatchSidecarEvent({ ...event, duration: 3600, markers });
    expect(useTestFeedStore.getState().duration).toBe(3600);
    expect(useTestFeedStore.getState().markers).toEqual(markers);

    dispatchSidecarEvent({ ...event, state: "loading", duration: null });
    expect(useTestFeedStore.getState().duration).toBeNull();
    expect(useTestFeedStore.getState().markers).toEqual([]);
  });

  it("formats the feed position as mm:ss", () => {
    expect(formatFeedPosition(754.6)).toBe("12:34");
    expect(formatFeedPosition(5)).toBe("00:05");
    expect(formatFeedPosition(3725)).toBe("1:02:05");
  });
});
