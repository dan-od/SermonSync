import { describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn(async () => ({ path: "/app/media/videos/assets/ready/playback.mp4" })));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => undefined), emit: vi.fn(async () => undefined) }));

import { createEmptyTemplate } from "../../lib/templateStorage";
import { createEmptyStudioDocument } from "../../types/studioDocument";
import { finishSavedTemplateVideo, useTemplateStore } from "../templateStore";

describe("saved template video preparation", () => {
  it("updates the saved scene and Studio document after background preparation", async () => {
    const staged = "/app/video-cache/1d3323d24ccb4bf2-source.bin";
    const prepared = "/app/media/videos/assets/ready/playback.mp4";
    const media = { type: "video" as const, src: staged, fit: "cover" as const, loop: true, x: 0, y: 0, width: 100, height: 100, opacity: 1 };
    const template = createEmptyTemplate("songs", 1);
    template.scene.backgroundMedia = media;
    template.studioDocument = { ...createEmptyStudioDocument("songs", "Test"), backgroundMedia: media };
    useTemplateStore.setState({ templates: [template] });

    finishSavedTemplateVideo(template.id, staged);
    await vi.waitFor(() => {
      const saved = useTemplateStore.getState().templates[0];
      expect(saved.scene.backgroundMedia?.src).toBe(prepared);
      expect(saved.studioDocument?.backgroundMedia?.src).toBe(prepared);
    });
    expect(invokeMock).toHaveBeenCalledWith("import_video_asset", expect.objectContaining({ path: staged, legacy: true }));
  });
});
