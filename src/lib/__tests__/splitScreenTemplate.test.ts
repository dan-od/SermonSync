// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ emit: vi.fn(async () => undefined) }));

import { createEmptyTemplate, loadTemplateThemes, saveTemplateThemes } from "../templateStorage";
import { createEmptyStudioDocument } from "../../types/studioDocument";
import { projectionScene } from "../projectionScene";

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
    const background = {
      type: "image" as const, src: "data:image/png;base64,background", fit: "cover" as const, loop: false,
      x: 0, y: 0, width: 100, height: 100, opacity: 1,
    };
    scripture.studioDocument.backgroundMode = "media";
    scripture.studioDocument.backgroundMedia = background;
    scripture.studioDocument.cameraMedia = camera;
    scripture.scene.backgroundMedia = background;
    scripture.scene.cameraMedia = camera;

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
      studioDocument: {
        backgroundMedia: { type: "image", src: background.src },
        cameraMedia: { x: 50, width: 50, cropLeft: 10, cameraDeviceId: "camera-1" },
      },
    });
    expect(loaded.templates.find((entry) => entry.id === song.id)?.studioDocument?.objects).toEqual([]);

    const loadedScripture = loaded.templates.find((entry) => entry.id === scripture.id)!;
    expect(projectionScene(loadedScripture)).toMatchObject({
      backgroundMedia: { type: "image", src: background.src },
      cameraMedia: { x: 50, width: 50, cameraDeviceId: "camera-1" },
    });
  });

  it("migrates a legacy camera background into the separate camera layer", async () => {
    const scripture = createEmptyTemplate("scriptures", 1);
    scripture.layout = "split-screen";
    scripture.studioDocument = createEmptyStudioDocument("scriptures", scripture.name);
    const legacyCamera = {
      type: "camera" as const, src: "", fit: "cover" as const, loop: false,
      x: 50, y: 0, width: 50, height: 100, opacity: 1,
      cameraSourceType: "local" as const, cameraDeviceId: "camera-legacy",
    };
    scripture.studioDocument.backgroundMode = "media";
    scripture.studioDocument.backgroundMedia = legacyCamera;
    scripture.scene.backgroundMedia = legacyCamera;

    await saveTemplateThemes({
      version: 2,
      templates: [scripture],
      defaults: {
        scriptures: { widescreen: null, "lower-third": null, "split-screen": null },
        songs: { widescreen: null, "lower-third": null, "split-screen": null },
      },
    });

    const loaded = await loadTemplateThemes();
    const migrated = loaded.templates.find((entry) => entry.id === scripture.id)!;
    expect(migrated.studioDocument).toMatchObject({
      backgroundMedia: null,
      cameraMedia: { type: "camera", cameraDeviceId: "camera-legacy" },
    });
    expect(migrated.scene).toMatchObject({
      backgroundMedia: null,
      cameraMedia: { type: "camera", cameraDeviceId: "camera-legacy" },
    });
  });
});
