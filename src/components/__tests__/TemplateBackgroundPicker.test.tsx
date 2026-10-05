// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { openMock, invokeMock } = vi.hoisted(() => ({ openMock: vi.fn(), invokeMock: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: openMock }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => undefined) }));

import { StudioLayersPanel } from "../Templates/StudioLayersPanel";
import type { TemplateBackgroundMedia } from "../../types/templates";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function PickerHarness({ initialMedia = null }: { initialMedia?: TemplateBackgroundMedia | null }) {
  const [media, setMedia] = useState<TemplateBackgroundMedia | null>(initialMedia);
  const [cameraEditMode, setCameraEditMode] = useState<"frame" | "crop">("frame");
  return <StudioLayersPanel
    objects={[]}
    selectedIds={[]}
    textSelection={null}
    onSelect={() => undefined}
    onToggleVisibility={() => undefined}
    onToggleLock={() => undefined}
    onDelete={() => undefined}
    onUpdate={() => undefined}
    onReorder={() => undefined}
    canUndo={false}
    canRedo={false}
    onUndo={() => undefined}
    onRedo={() => undefined}
    background=""
    onBackgroundChange={() => undefined}
    backgroundMode="media"
    backgroundColor=""
    backgroundGradientStart=""
    backgroundGradientEnd=""
    backgroundGradientAngle={0}
    backgroundGradientStyle="linear"
    backgroundBlur={0}
    backgroundMedia={media}
    cameraEditMode={cameraEditMode}
    onCameraEditModeChange={(mode) => { if (mode !== "off") setCameraEditMode(mode); }}
    onBackgroundConfigChange={({ media: next }) => setMedia(next ?? null)}
  />;
}

describe("template background media picker", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete (window as Window & { __TAURI_INTERNALS__?: object }).__TAURI_INTERNALS__;
    vi.clearAllMocks();
  });

  it("uses one native picker for both photos and videos without reading video in the webview", async () => {
    let finishPreparation!: (asset: object) => void;
    const preparation = new Promise<object>((resolve) => { finishPreparation = resolve; });
    openMock.mockResolvedValue("/home/user/clip.mp4");
    invokeMock.mockImplementation((command: string) => command === "import_video_asset"
      ? preparation : Promise.reject(new Error(command)));
    const read = vi.spyOn(FileReader.prototype, "readAsDataURL");
    await act(async () => root.render(<PickerHarness />));

    expect([...container.querySelectorAll("button")].filter((button) => button.textContent === "Choose Media")).toHaveLength(1);
    expect(container.textContent).not.toContain("Choose Photo");
    expect(container.textContent).not.toContain("Choose Video");
    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.textContent === "Choose Media")!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(openMock.mock.calls[0][0].filters).toBeUndefined();
    expect(invokeMock).toHaveBeenCalledWith("import_video_asset", expect.objectContaining({ path: "/home/user/clip.mp4", legacy: false }));
    expect(read).not.toHaveBeenCalled();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Importing media");
    expect([...container.querySelectorAll("button")].filter((button) => button.textContent === "Choose Media")).toHaveLength(1);

    await act(async () => { finishPreparation({ path: "/managed/media/videos/assets/ready/playback.mp4" }); await preparation; });
    expect(container.textContent).toContain("clip.mp4");
  });

  it("imports an image through the same picker", async () => {
    openMock.mockResolvedValue("/home/user/still.png");
    invokeMock.mockResolvedValue("data:image/png;base64,YQ==");
    await act(async () => root.render(<PickerHarness />));
    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.textContent === "Choose Media")!.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(invokeMock).toHaveBeenCalledWith("read_template_image_file", { path: "/home/user/still.png" });
    expect(invokeMock).not.toHaveBeenCalledWith("stage_template_video_file", expect.anything());
    expect(container.textContent).toContain("still.png");
  });

  it("places camera crop mode inside Cropping without a frame edit button", async () => {
    const camera: TemplateBackgroundMedia = { type: "camera", src: "", fit: "cover", loop: false, x: 0, y: 0, width: 100, height: 100, opacity: 1, cameraSourceType: "local", cameraDeviceId: "/dev/video0" };
    await act(async () => root.render(<PickerHarness initialMedia={camera} />));
    expect(container.textContent).not.toContain("Edit camera frame");
    const cropping = [...container.querySelectorAll("details")].find((section) => section.querySelector("summary")?.textContent === "Cropping");
    expect(cropping?.querySelector("button")?.textContent).toBe("Crop on canvas");
    await act(async () => cropping?.querySelector("button")?.click());
    expect(cropping?.querySelector("button")?.getAttribute("aria-pressed")).toBe("true");
    expect(cropping?.querySelector("button")?.textContent).toBe("Done cropping");
  });
});
