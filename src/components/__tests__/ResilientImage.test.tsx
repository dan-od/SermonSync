// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { ResilientImage } from "../ResilientImage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ResilientImage", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("reads the original image when the asset URL fails and signals readiness after it loads", async () => {
    const dataUrl = "data:image/jpeg;base64,YQ==";
    const onLoad = vi.fn();
    invokeMock.mockResolvedValue(dataUrl);
    await act(async () => root.render(<ResilientImage src="http://asset.invalid/still.jpeg" sourcePath="/pictures/still.jpeg" alt="Still" onLoad={onLoad} />));

    await act(async () => {
      container.querySelector("img")!.dispatchEvent(new Event("error"));
      await Promise.resolve();
    });

    expect(invokeMock).toHaveBeenCalledWith("read_template_image_file", { path: "/pictures/still.jpeg" });
    expect(container.querySelector("img")?.src).toBe(dataUrl);
    await act(async () => container.querySelector("img")!.dispatchEvent(new Event("load")));
    expect(onLoad).toHaveBeenCalledOnce();
  });

  it("reports an unavailable image when the file cannot be read", async () => {
    const onUnavailable = vi.fn();
    invokeMock.mockRejectedValue(new Error("missing file"));
    await act(async () => root.render(<ResilientImage src="http://asset.invalid/missing.jpeg" sourcePath="/pictures/missing.jpeg" alt="Missing" onUnavailable={onUnavailable} />));
    await act(async () => {
      container.querySelector("img")!.dispatchEvent(new Event("error"));
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Image unavailable");
    expect(onUnavailable).toHaveBeenCalledOnce();
  });
});
