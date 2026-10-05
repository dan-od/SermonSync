import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProjectorView } from "../ProjectorView";

const baseProps = {
  title: "LIVE",
  feedOverride: "live" as const,
  overlayMode: "widescreen" as const,
  theme: "cross" as const,
  isLive: true,
  fontSizePx: 48,
};

describe("ProjectorView without a default template", () => {
  it("shows scripture text instead of a blank output", () => {
    const html = renderToStaticMarkup(<ProjectorView {...baseProps} slide={{ reference: { book: "Genesis", chapter: 1, verse: 1 }, text: "In the beginning", version: "KJV" }} bare />);
    expect(html).toContain("In the beginning");
    expect(html).toContain("Genesis 1:1");
  });

  it("shows a media image on the output", () => {
    const html = renderToStaticMarkup(<ProjectorView {...baseProps} slide={{ reference: { book: "Media", chapter: 1, verse: 1 }, text: "cover.png", version: "MEDIA", media: { type: "image", src: "asset://localhost/cover.png", name: "cover.png" } }} bare />);
    expect(html).toContain('src="asset://localhost/cover.png"');
    expect(html).toContain('alt="cover.png"');
  });
});
