// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ emit: vi.fn(async () => undefined) }));

import { createEmptyTemplate, loadTemplateThemes, saveTemplateThemes } from "../templateStorage";
import { createEmptyStudioDocument } from "../../types/studioDocument";

afterEach(() => window.localStorage.clear());

describe("split screen template persistence", () => {
  it("keeps independently assigned Scripture and Song templates after reload", async () => {
    const scripture = createEmptyTemplate("scriptures", 1);
    const song = createEmptyTemplate("songs", 1);
    scripture.layout = "split-screen";
    song.layout = "split-screen";
    scripture.studioDocument = createEmptyStudioDocument("scriptures", scripture.name);
    song.studioDocument = createEmptyStudioDocument("songs", song.name);
    const camera = {
      type: "camera" as const, src: "", fit: "cover" as const, loop: false,
      x: 50, y: 0, width: 50, height: 100, cropLeft: 10, opacity: 1,
      cameraSourceType: "local" as const, cameraDeviceId: "camera-1",
    };
    scripture.studioDocument.backgroundMode = "media";
    scripture.studioDocument.backgroundMedia = camera;
    scripture.scene.backgroundMedia = camera;

    await saveTemplateThemes({
      version: 2,
      templates: [scripture, song],
      defaults: {
        scriptures: { widescreen: null, "lower-third": null, "split-screen": scripture.id },
        songs: { widescreen: null, "lower-third": null, "split-screen": song.id },
      },
    });

    const loaded = await loadTemplateThemes();
    expect(loaded.defaults.scriptures["split-screen"]).toBe(scripture.id);
    expect(loaded.defaults.songs["split-screen"]).toBe(song.id);
    expect(loaded.templates.find((entry) => entry.id === scripture.id)).toMatchObject({
      layout: "split-screen",
      studioDocument: { backgroundMedia: { x: 50, width: 50, cropLeft: 10, cameraDeviceId: "camera-1" } },
    });
    expect(loaded.templates.find((entry) => entry.id === song.id)?.studioDocument?.objects).toEqual([]);
  });
});
