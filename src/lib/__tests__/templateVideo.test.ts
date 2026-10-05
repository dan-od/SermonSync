import { describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { stageTemplateVideo } from "../templateVideo";

describe("legacy template video staging", () => {
  it("stages a persisted data URL so it can enter the managed importer", async () => {
    const source = "data:video/mp4;base64,AQID";
    const staged = "/app/video-cache/1d3323d24ccb4bf2-source.bin";
    invokeMock.mockImplementation((command: string) => {
      if (command === "stage_template_video") return Promise.resolve(staged);
      throw new Error(`Unexpected command: ${command}`);
    });

    expect(await stageTemplateVideo(source)).toBe(staged);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("stage_template_video", { dataUrl: source });
  });
});
