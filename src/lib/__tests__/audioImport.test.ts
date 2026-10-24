import { describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { importAudio } from "../audioImport";

describe("audio import queue", () => {
  it("deduplicates paths and prepares at most three files at once", async () => {
    const finish = new Map<string, (path: string) => void>();
    const fail = new Map<string, (error: Error) => void>();
    invokeMock.mockImplementation((_command: string, { path }: { path: string }) => new Promise((resolve, reject) => {
      finish.set(path, (managedPath) => resolve({ id: path, path: managedPath }));
      fail.set(path, reject);
    }));

    const first = importAudio("first.mp3");
    expect(importAudio("first.mp3")).toBe(first);
    const second = importAudio("second.mp3");
    const third = importAudio("third.mp3");
    const fourth = importAudio("fourth.mp3");
    const fifth = importAudio("fifth.mp3");
    const secondFailure = expect(second).rejects.toThrow("bad audio");

    expect(invokeMock.mock.calls.map((call) => call[1].path)).toEqual(["first.mp3", "second.mp3", "third.mp3"]);
    finish.get("first.mp3")?.("/managed/first.mp3");
    await expect(first).resolves.toEqual({ id: "first.mp3", path: "/managed/first.mp3" });
    await vi.waitFor(() => expect(finish.has("fourth.mp3")).toBe(true));
    fail.get("second.mp3")?.(new Error("bad audio"));
    await secondFailure;
    await vi.waitFor(() => expect(finish.has("fifth.mp3")).toBe(true));

    finish.get("third.mp3")?.("/managed/third.mp3");
    finish.get("fourth.mp3")?.("/managed/fourth.mp3");
    finish.get("fifth.mp3")?.("/managed/fifth.mp3");
    await Promise.all([third, fourth, fifth]);
    expect(invokeMock).toHaveBeenCalledTimes(5);
  });
});
