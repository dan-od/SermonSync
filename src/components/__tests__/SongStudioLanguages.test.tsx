// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Song } from "../../stores/songStore";

const { saveSong } = vi.hoisted(() => ({ saveSong: vi.fn() }));

vi.mock("../../stores/songStore", () => ({
  useSongStore: (selector: (state: { saveSong: typeof saveSong }) => unknown) => selector({ saveSong }),
  getSongLanguageVariant: (song: Song, language?: string) =>
    song.languageVariants?.find((variant) => variant.language.toLowerCase() === language?.toLowerCase())
      ?? song.languageVariants?.find((variant) => variant.language === song.defaultLanguage)
      ?? { language: "English", slides: song.slides },
  getSongLanguageVariants: (song: Song) => song.languageVariants ?? [{ language: "English", slides: song.slides }],
}));

vi.mock("../../stores/templateStore", () => ({
  useTemplateStore: (selector: (state: { templates: never[]; defaults: Record<string, never> }) => unknown) =>
    selector({ templates: [], defaults: {} }),
}));

import { useSongStudioEditor } from "../Songs/useSongStudioEditor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const song: Song = {
  id: "song-1",
  title: "Test Song",
  artist: "Choir",
  defaultLanguage: "English",
  slides: [{ label: "Verse 1", text: "Amazing grace" }],
  languageVariants: [
    { language: "English", slides: [{ label: "Verse 1", text: "Amazing grace" }] },
    { language: "Spanish", slides: [{ label: "Verse 1", text: "Gracia admirable" }] },
  ],
};

describe("song studio language variants", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    saveSong.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("switches lyric drafts by language and saves only the edited variant", () => {
    function Harness() {
      const editor = useSongStudioEditor({ song, onClose: vi.fn() });
      return (
        <>
          <textarea aria-label="Lyrics" value={editor.songText} onChange={(event) => editor.handleSongTextChange(event.target.value)} />
          <output>{editor.availableLanguages.join("|")}</output>
          <button type="button" onClick={() => editor.switchLanguage("Spanish")}>Spanish</button>
          <button type="button" onClick={editor.handleSave}>Save</button>
        </>
      );
    }

    act(() => root.render(<Harness />));
    const lyrics = container.querySelector<HTMLTextAreaElement>('[aria-label="Lyrics"]')!;
    expect(container.querySelector("output")?.textContent).toBe("Hausa|Yoruba|Igbo|Spanish|Ikwerre|Mandarin Chinese|Hindi|English");
    act(() => container.querySelectorAll("button")[0]!.click());
    expect(lyrics.value).toContain("Gracia admirable");

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(lyrics, "[Verse 1]\nHola, mundo");
      lyrics.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => container.querySelectorAll("button")[1]!.click());

    expect(saveSong).toHaveBeenCalledWith(expect.objectContaining({
      defaultLanguage: "English",
      slides: [{ label: "Verse 1", text: "Amazing grace" }],
      languageVariants: [
        { language: "English", slides: [{ label: "Verse 1", text: "Amazing grace" }] },
        { language: "Spanish", slides: [{ label: "Verse 1", text: "Hola, mundo" }] },
      ],
    }));
  });

  it("creates a listed language variant without replacing the default lyrics", () => {
    function Harness() {
      const editor = useSongStudioEditor({ song, onClose: vi.fn() });
      return (
        <>
          <textarea aria-label="Lyrics" value={editor.songText} onChange={(event) => editor.handleSongTextChange(event.target.value)} />
          <button type="button" onClick={() => editor.switchLanguage("Hindi")}>Hindi</button>
          <button type="button" onClick={editor.handleSave}>Save</button>
        </>
      );
    }

    act(() => root.render(<Harness />));
    const lyrics = container.querySelector<HTMLTextAreaElement>('[aria-label="Lyrics"]')!;
    act(() => container.querySelectorAll("button")[0]!.click());
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(lyrics, "[Verse 1]\nNamaste");
      lyrics.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => container.querySelectorAll("button")[1]!.click());

    expect(saveSong).toHaveBeenCalledWith(expect.objectContaining({
      defaultLanguage: "English",
      slides: [{ label: "Verse 1", text: "Amazing grace" }],
      languageVariants: [
        { language: "English", slides: [{ label: "Verse 1", text: "Amazing grace" }] },
        { language: "Spanish", slides: [{ label: "Verse 1", text: "Gracia admirable" }] },
        { language: "Hindi", slides: [{ label: "Verse 1", text: "Namaste" }] },
      ],
    }));
  });

  it("keeps an untouched language without slides or saved lyrics", () => {
    function Harness() {
      const editor = useSongStudioEditor({ song, onClose: vi.fn() });
      return (
        <>
          <textarea aria-label="Lyrics" value={editor.songText} onChange={(event) => editor.handleSongTextChange(event.target.value)} />
          <output>{editor.slides.length}</output>
          <button type="button" onClick={() => editor.switchLanguage("Hausa")}>Hausa</button>
          <button type="button" onClick={editor.handleSave}>Save</button>
        </>
      );
    }

    act(() => root.render(<Harness />));
    act(() => container.querySelectorAll("button")[0]!.click());

    expect(container.querySelector<HTMLTextAreaElement>('[aria-label="Lyrics"]')?.value).toBe("");
    expect(container.querySelector("output")?.textContent).toBe("0");

    act(() => container.querySelectorAll("button")[1]!.click());
    expect(saveSong).toHaveBeenCalledWith(expect.objectContaining({
      languageVariants: [
        { language: "English", slides: [{ label: "Verse 1", text: "Amazing grace" }] },
        { language: "Spanish", slides: [{ label: "Verse 1", text: "Gracia admirable" }] },
      ],
    }));
  });
});
