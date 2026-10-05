// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { openDialog, invokeCommand, listenEvent, progressCallbacks } = vi.hoisted(() => ({
  openDialog: vi.fn(),
  invokeCommand: vi.fn().mockResolvedValue("/cached/thumbnail.jpg"),
  listenEvent: vi.fn(),
  progressCallbacks: [] as Array<(event: { payload: { requestId: string; state: string; percent: number | null; assetId?: string } }) => void>,
}));

vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (path: string) => path, invoke: invokeCommand }));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenEvent }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: openDialog }));

import { LocalLibraryPanel, type LibraryTab } from "../LocalLibraryPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("media library tab", () => {
  let container: HTMLDivElement;
  let root: Root;
  let activeTab: LibraryTab;
  const onPreviewMedia = vi.fn();
  const onSendMedia = vi.fn();

  const render = () => root.render(
    <LocalLibraryPanel
      activeTab={activeTab}
      searchQuery=""
      searchMode="words"
      onActiveTabChange={vi.fn()}
      previewReference={null}
      liveReference={null}
      onPreviewSlide={vi.fn()}
      onSendLive={vi.fn()}
      onPreviewMedia={onPreviewMedia}
      onSendMedia={onSendMedia}
    />,
  );

  const button = (label: string) => [...(container.querySelector('[data-library-tab="media"]')?.querySelectorAll("button") ?? [])]
    .find((entry) => entry.textContent?.trim() === label);

  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    window.localStorage.clear();
    openDialog.mockReset();
    progressCallbacks.length = 0;
    listenEvent.mockReset();
    listenEvent.mockImplementation(async (_event, callback) => {
      progressCallbacks.push(callback);
      return () => undefined;
    });
    invokeCommand.mockReset();
    invokeCommand.mockImplementation(async (command: string) => command === "import_video_asset"
      ? { id: `${"a".repeat(64)}-sermonsync-playback-v1`, path: `/managed/media/videos/assets/${"a".repeat(64)}-sermonsync-playback-v1/playback.mp4`, posterPath: "/managed/poster.jpg", durationMs: 1000, sourceSha256: "a".repeat(64), profile: "sermonsync-playback-v1" }
      : "/cached/thumbnail.jpg");
    onPreviewMedia.mockClear();
    onSendMedia.mockClear();
    activeTab = "media";
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("imports mixed files through one button and sorts them by extension", async () => {
    openDialog.mockResolvedValue(["/media/choir.MP3", "/media/poster.PNG", "/media/intro.mp4"]);
    await act(async () => render());
    await act(async () => button("+")?.click());
    await act(async () => { await vi.waitFor(() => expect(invokeCommand).toHaveBeenCalledWith("import_video_asset", expect.objectContaining({ path: "/media/intro.mp4", legacy: false }))); });
    expect(invokeCommand).toHaveBeenCalledWith("import_video_asset", expect.objectContaining({ maxSourceBytes: 600 * 1024 * 1024 }));

    expect(openDialog).toHaveBeenCalledOnce();
    expect(container.querySelectorAll('button[aria-label="Import media files"]')).toHaveLength(1);
    expect([...container.querySelectorAll("button")].some((entry) => /^Audio\s*1$/.test(entry.textContent?.trim() ?? ""))).toBe(true);
    expect([...container.querySelectorAll("button")].some((entry) => /^Images\s*1$/.test(entry.textContent?.trim() ?? ""))).toBe(true);
    expect([...container.querySelectorAll("button")].some((entry) => /^Videos\s*1$/.test(entry.textContent?.trim() ?? ""))).toBe(true);
    expect(window.localStorage.getItem("sermonsync-media-library-v1")).toContain('"category":"audio"');
    expect(window.localStorage.getItem("sermonsync-media-library-v1")).toContain("/managed/media/videos/assets/");
  });

  it("probes a video even when its extension is unfamiliar", async () => {
    openDialog.mockResolvedValue(["/media/recording.mxf"]);
    await act(async () => render());
    await act(async () => button("+")?.click());
    await act(async () => {
      await vi.waitFor(() => expect(invokeCommand).toHaveBeenCalledWith("import_video_asset", expect.objectContaining({ path: "/media/recording.mxf", legacy: false })));
    });
    expect(openDialog).toHaveBeenCalledWith(expect.not.objectContaining({ filters: expect.anything() }));
  });

  it("keeps a new video out of the gallery until its managed file is ready", async () => {
    let finishImport!: (asset: unknown) => void;
    invokeCommand.mockImplementation(async (command: string) => command === "import_video_asset"
      ? new Promise((resolve) => { finishImport = resolve; })
      : "/cached/thumbnail.jpg");
    openDialog.mockResolvedValue(["/media/choir.mp3", "/media/intro.mxf"]);
    await act(async () => render());
    await act(async () => button("+")?.click());
    expect(window.localStorage.getItem("sermonsync-media-library-v1")).toContain('"category":"audio"');
    expect(window.localStorage.getItem("sermonsync-media-library-v1")).not.toContain('"category":"videos"');
    await act(async () => button("Videos0")?.click());
    expect(container.textContent).toContain("intro.mxf");

    await act(async () => finishImport({
      id: `${"b".repeat(64)}-sermonsync-playback-v1`,
      path: `/managed/media/videos/assets/${"b".repeat(64)}-sermonsync-playback-v1/playback.mp4`,
      posterPath: "/managed/poster.jpg",
      durationMs: 1000,
      sourceSha256: "b".repeat(64),
      profile: "sermonsync-playback-v1",
    }));
    expect(window.localStorage.getItem("sermonsync-media-library-v1")).toContain('"category":"videos"');
    expect(window.localStorage.getItem("sermonsync-media-library-v1")).toContain('"category":"audio"');
  });

  it("uses the generated snapshot URL for managed video thumbnails", async () => {
    const hash = "c".repeat(64);
    window.localStorage.setItem("sermonsync-media-library-v1", JSON.stringify([{
      id: "video-1",
      name: "Welcome loop",
      path: `/managed/media/videos/assets/${hash}-sermonsync-playback-v1/playback.mp4`,
      category: "videos",
    }]));
    await act(async () => render());
    await act(async () => button("Videos1")?.click());
    const snapshot = container.querySelector('[role="button"][aria-label="Send live Welcome loop"] img');
    expect(snapshot?.getAttribute("src")).toBe(`http://127.0.0.1:8000/api/media-video/${hash}-sermonsync-playback-v1/poster.jpg`);
    expect(snapshot?.parentElement?.style.aspectRatio).toBe("16 / 9");
  });

  it("keeps an image thumbnail loaded across parent rerenders", async () => {
    const dataUrl = "data:image/jpeg;base64,YQ==";
    window.localStorage.setItem("sermonsync-media-library-v1", JSON.stringify([{
      id: "image-one", name: "Still", path: "/media/still.jpeg", category: "images",
    }]));
    invokeCommand.mockImplementation(async (command: string) => command === "read_template_image_file" ? dataUrl : "/cached/thumbnail.jpg");
    await act(async () => render());
    await act(async () => {
      await vi.waitFor(() => expect(container.querySelector('[role="button"][aria-label="Send live Still"] img')?.getAttribute("src")).toBe(dataUrl));
    });

    const image = container.querySelector('[role="button"][aria-label="Send live Still"] img');
    const thumbnailCalls = invokeCommand.mock.calls.filter(([command]) => command === "create_media_thumbnail");
    expect(thumbnailCalls).toHaveLength(1);
    await act(async () => render());
    expect(container.querySelector('[role="button"][aria-label="Send live Still"] img')).toBe(image);
    expect(invokeCommand.mock.calls.filter(([command]) => command === "create_media_thumbnail")).toHaveLength(1);
  });

  it("keeps a video context menu inside the visible gallery", async () => {
    const hash = "e".repeat(64);
    window.localStorage.setItem("sermonsync-media-library-v1", JSON.stringify([{
      id: "video-edge",
      name: "Edge video",
      path: `/managed/media/videos/assets/${hash}-sermonsync-playback-v1/playback.mp4`,
      category: "videos",
    }]));
    await act(async () => render());
    await act(async () => button("Videos1")?.click());

    const gallery = container.querySelector<HTMLElement>('[data-media-gallery]');
    expect(gallery).not.toBeNull();
    vi.spyOn(gallery!, "getBoundingClientRect").mockReturnValue({ left: 220, top: 20, right: 800, bottom: 300, width: 580, height: 280, x: 220, y: 20, toJSON: () => ({}) });
    const tile = container.querySelector('[role="button"][aria-label="Send live Edge video"]');
    expect(tile).not.toBeNull();
    await act(async () => tile!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 790, clientY: 290 })));

    const menu = document.querySelector<HTMLElement>('[role="menu"]');
    expect(menu?.parentElement).toBe(document.body);
    expect(menu?.style.left).toBe("624px");
    expect(menu?.style.top).toBe("180px");
    expect(menu?.style.visibility).toBe("visible");
    expect(menu?.textContent).toContain("Delete");
  });

  it("recovers a completed import if its original reply is delayed", async () => {
    const hash = "d".repeat(64);
    const assetId = `${hash}-sermonsync-playback-v1`;
    const asset = {
      id: assetId,
      path: `/managed/media/videos/assets/${assetId}/playback.mp4`,
      posterPath: `/managed/media/videos/assets/${assetId}/poster.jpg`,
      durationMs: 1000,
      sourceSha256: hash,
      profile: "sermonsync-playback-v1",
    };
    invokeCommand.mockImplementation((command: string) => command === "import_video_asset"
      ? new Promise(() => undefined)
      : Promise.resolve(command === "get_ready_video_asset" ? asset : "/cached/thumbnail.jpg"));
    openDialog.mockResolvedValue(["/media/stalled.mp4"]);
    const intervalSpy = vi.spyOn(window, "setInterval");
    await act(async () => render());
    await act(async () => button("+")?.click());
    const request = invokeCommand.mock.calls.find(([command]) => command === "import_video_asset")?.[1] as { requestId: string };
    expect(request).toBeTruthy();
    await act(async () => progressCallbacks[0]({ payload: { requestId: request.requestId, state: "processing", percent: 70, assetId } }));
    const later = Date.now() + 20000;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(later);
    const recoveryTimer = intervalSpy.mock.calls.find(([, delay]) => delay === 5000)?.[0] as (() => void) | undefined;
    expect(recoveryTimer).toBeTruthy();
    await act(async () => { recoveryTimer?.(); await Promise.resolve(); });
    expect(invokeCommand).toHaveBeenCalledWith("get_ready_video_asset", { assetId });
    expect(window.localStorage.getItem("sermonsync-media-library-v1")).toContain(asset.path);
    expect(container.textContent).not.toContain("processing 70%");
    nowSpy.mockRestore();
  });

  it("shows 16:9 snapshots, routes clicks through the toggle, and offers right-click actions", async () => {
    window.localStorage.setItem("sermonsync-media-library-v1", JSON.stringify([
      { id: "image-1", name: "Poster", path: "/media/poster.png", category: "images" },
    ]));
    await act(async () => render());

    let tile = container.querySelector('[role="button"][aria-label="Send live Poster"]') as HTMLElement;
    expect(tile).toBeTruthy();
    expect(tile.style.aspectRatio).toBe("16 / 9");
    expect(tile.querySelector("img")?.getAttribute("src")).toBe("/cached/thumbnail.jpg");
    expect(container.textContent).not.toContain("OPEN STUDIO");
    expect(container.textContent).not.toContain("SEND LIVE");

    act(() => tile.click());
    expect(onSendMedia).toHaveBeenCalledOnce();
    act(() => button("Preview First")?.click());
    tile = container.querySelector('[role="button"][aria-label="Preview Poster"]') as HTMLElement;
    act(() => tile.click());
    expect(onPreviewMedia).toHaveBeenCalledOnce();

    act(() => tile.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    expect(document.querySelector('[role="menu"]')?.textContent).toContain("Edit");
    expect(document.querySelector('[role="menu"]')?.textContent).toContain("Rename");
    expect(document.querySelector('[role="menu"]')?.textContent).toContain("Delete");

    activeTab = "songs";
    await act(async () => render());
    activeTab = "media";
    await act(async () => render());
    const restoredTile = container.querySelector('[role="button"][aria-label="Preview Poster"]') as HTMLElement;
    expect(restoredTile).toBeTruthy();
    expect(restoredTile.style.border).toBe("2px solid var(--color-primary)");
  });
});
