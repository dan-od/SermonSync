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

  it("drops the badge once the feed stops", () => {
    const html = renderToStaticMarkup(
      <TestFeedBarView enabled status={{ ...playing, state: "stopped" }} />,
    );
    expect(html).not.toContain("TEST FEED:");
  });
});
