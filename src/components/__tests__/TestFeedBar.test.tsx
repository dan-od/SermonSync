import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TestFeedBarView } from "../TestFeedBar";

const playing = {
  type: "test_feed" as const,
  state: "playing" as const,
  title: "Faith that moves mountains",
  source: "https://www.youtube.com/watch?v=abc",
  position: 754.6,
  start: 600,
  end: 1200,
  speed: 1,
};

describe("TestFeedBar (SS-072)", () => {
  it("renders nothing for a production sidecar with no feed", () => {
    expect(renderToStaticMarkup(<TestFeedBarView enabled={false} status={null} />)).toBe("");
  });

  it("shows the dev source input only when the sidecar enables it", () => {
    const html = renderToStaticMarkup(<TestFeedBarView enabled status={null} />);
    expect(html).toContain("DEV feed: URL or path");
    expect(html).toContain("▶ FEED");
    expect(html).not.toContain("TEST FEED:");
  });

  it("badges an active feed with its title and position", () => {
    const html = renderToStaticMarkup(<TestFeedBarView enabled status={playing} />);
    expect(html).toContain("TEST FEED:");
    expect(html).toContain("Faith that moves mountains");
    expect(html).toContain("· 12:34");
    expect(html).toContain("■ STOP");
  });

  it("keeps the badge even if the dev flag is not known yet", () => {
    const html = renderToStaticMarkup(
      <TestFeedBarView enabled={false} status={{ ...playing, state: "loading" }} />,
    );
    expect(html).toContain("TEST FEED:");
    expect(html).toContain("LOADING");
    expect(html).not.toContain("DEV feed: URL or path");
  });

  const info = {
    source: "https://www.youtube.com/watch?v=abc",
    title: "Faith that moves mountains",
    duration: 3600,
    captions: "auto",
    cues: [{ start: 2460, end: 2466, text: "turn with me to John three sixteen" }],
    markers: [
      { time: 2463.2, reference: "John 3:16", caption_text: "turn with me to John three sixteen" },
    ],
  };

  it("shows the seek bar with reference markers under the badge", () => {
    const html = renderToStaticMarkup(
      <TestFeedBarView enabled status={playing} sourceInfo={info} />,
    );
    expect(html).toContain('data-testid="test-feed-seek"');
    expect(html).toContain('aria-label="Seek test feed"');
    expect(html).toContain('aria-label="John 3:16 at 41:03"');
    expect(html).toContain("−10 s");
    expect(html).toContain("+10 s");
    expect(html).toContain("+30 s");
    expect(html).toContain("12:34 / 1:00:00");
    expect(html.indexOf("TEST FEED:")).toBeLessThan(html.indexOf("test-feed-seek"));
  });

  it("puts the seek bar under the source field (SS-075)", () => {
    const html = renderToStaticMarkup(
      <TestFeedBarView enabled status={playing} sourceInfo={info} />,
    );
    expect(html.indexOf("DEV feed: URL or path")).toBeLessThan(html.indexOf("test-feed-seek"));
  });

  it("draws references the matcher detected during the run (SS-075)", () => {
    const html = renderToStaticMarkup(
      <TestFeedBarView
        enabled
        status={playing}
        sourceInfo={info}
        detectedMarkers={[{ time: 2470.4, reference: "John 3:16", confidence: 0.991 }]}
      />,
    );
    expect(html).toContain('aria-label="Detected John 3:16 — 99.1% at 41:10"');
  });

  it("uses the feed's own duration when the source was not loaded with Enter", () => {
    const html = renderToStaticMarkup(
      <TestFeedBarView
        enabled
        status={playing}
        feedDuration={3600}
        detectedMarkers={[{ time: 30, reference: "Romans 8:28", confidence: 0.95 }]}
      />,
    );
    expect(html).toContain('data-testid="test-feed-seek"');
    expect(html).toContain("12:34 / 1:00:00");
    expect(html).toContain("Detected Romans 8:28 — 95.0% at 00:30");
  });

  it("keeps detected markers off a different source's bar", () => {
    const html = renderToStaticMarkup(
      <TestFeedBarView
        enabled
        status={{ ...playing, state: "stopped" }}
        sourceInfo={{ ...info, source: "" }}
        detectedMarkers={[{ time: 30, reference: "Romans 8:28", confidence: 0.95 }]}
      />,
    );
    expect(html).toContain('data-testid="test-feed-seek"');
    expect(html).not.toContain("Detected Romans 8:28");
  });

  it("lets a start point be picked before the feed runs", () => {
    const html = renderToStaticMarkup(
      <TestFeedBarView enabled status={null} sourceInfo={{ ...info, source: "" }} />,
    );
    expect(html).toContain('aria-label="Pick test feed start"');
    expect(html).toContain("start 00:00 / 1:00:00");
    expect(html).toContain("1 refs in captions");
  });

  it("hides the seek bar for a source that is not loaded", () => {
    const html = renderToStaticMarkup(
      <TestFeedBarView enabled status={playing} sourceInfo={{ ...info, source: "other" }} />,
    );
    expect(html).not.toContain("test-feed-seek");
  });

  it("drops the badge once the feed stops", () => {
    const html = renderToStaticMarkup(
      <TestFeedBarView enabled status={{ ...playing, state: "stopped" }} />,
    );
    expect(html).not.toContain("TEST FEED:");
  });
});
