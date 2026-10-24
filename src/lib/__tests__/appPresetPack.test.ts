import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import appPresetPack from "../appPresetPack.json";
import { appPresetCounts, installAppPresets } from "../appPresetInstaller";
import { useOverlayStore } from "../../stores/overlayStore";
import { useSongStore } from "../../stores/songStore";
import { useTemplateStore } from "../../stores/templateStore";

const allPresets = { songs: true, overlays: true, templates: true };

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  useSongStore.setState({ songs: [], initialized: false });
  useOverlayStore.setState({ overlays: [] });
  useTemplateStore.setState({
    initialized: false,
    loading: false,
    error: null,
    templates: [],
    defaults: {
      scriptures: { widescreen: null, "lower-third": null, "split-screen": null },
      songs: { widescreen: null, "lower-third": null, "split-screen": null },
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("app preset pack", () => {
  it("contains the local songs, overlays, and template designs", () => {
    expect(appPresetPack.songs).toHaveLength(49);
    expect(appPresetPack.overlays).toHaveLength(2);
    expect(appPresetPack.templates).toHaveLength(4);
  });

  it("contains unique IDs and no local media bindings in templates or overlays", () => {
    for (const key of ["songs", "overlays", "templates"] as const) {
      const ids = appPresetPack[key].map((entry) => entry.id);
      expect(new Set(ids).size).toBe(ids.length);
    }

    for (const template of appPresetPack.templates) {
      expect(template.scene.backgroundMedia).toBeNull();
      expect(template.studioDocument?.backgroundMedia).toBeNull();
      expect(JSON.stringify(template)).not.toMatch(/\/home\/|data:video|data:image/i);
    }
    expect(JSON.stringify(appPresetPack.overlays)).not.toMatch(/\/home\/|data:image/i);
  });

  it("installs once, skips repeat downloads, and preserves local edits", async () => {
    const first = await installAppPresets(allPresets);
    expect(first).toEqual({
      songs: { added: appPresetCounts.songs, alreadyPresent: 0 },
      overlays: { added: appPresetCounts.overlays, alreadyPresent: 0 },
      templates: { added: appPresetCounts.templates, alreadyPresent: 0 },
    });

    const song = appPresetPack.songs[0];
    const overlay = appPresetPack.overlays[0];
    const template = appPresetPack.templates[0];
    useSongStore.getState().updateSong(song.id, { title: "My local song edit" });
    useOverlayStore.getState().rename(overlay.id, "My local overlay edit");
    await useTemplateStore.getState().renameTemplate(template.id, "My local template edit");

    const second = await installAppPresets(allPresets);
    expect(second).toEqual({
      songs: { added: 0, alreadyPresent: appPresetCounts.songs },
      overlays: { added: 0, alreadyPresent: appPresetCounts.overlays },
      templates: { added: 0, alreadyPresent: appPresetCounts.templates },
    });
    expect(useSongStore.getState().songs.find((item) => item.id === song.id)?.title).toBe("My local song edit");
    expect(useOverlayStore.getState().overlays.find((item) => item.id === overlay.id)?.name).toBe("My local overlay edit");
    expect(useTemplateStore.getState().templates.find((item) => item.id === template.id)?.name).toBe("My local template edit");
  });
});