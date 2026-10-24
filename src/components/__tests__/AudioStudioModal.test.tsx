// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/waveform", () => ({ useAudioPeaks: () => ({ peaks: [0.5], duration: 12, loading: false, error: null }) }));
vi.mock("../Media/Waveform", () => ({ WaveformCanvas: () => <div /> }));

import { AudioStudioModal } from "../Media/AudioStudioModal";
import { useProjectorStore } from "../../stores/projectorStore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Audio Studio playback", () => {
  const container = document.createElement("div");
  const root = createRoot(container);

  afterEach(() => {
    vi.restoreAllMocks();
    useProjectorStore.setState({ feedOverride: "black", liveMedia: null });
  });

  it("shows the media playback rejection", async () => {
    document.body.appendChild(container);
    useProjectorStore.setState({ feedOverride: "black", liveMedia: null });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new Error("NotSupportedError: could not decode"));
    await act(async () => root.render(<AudioStudioModal open name="Choir" src="http://127.0.0.1:8000/audio.mp3" sourcePath="/managed/audio.mp3" settings={{ volume: 1, trimStart: 0, trimEnd: null }} onClose={vi.fn()} onSave={vi.fn()} />));
    await act(async () => document.querySelector<HTMLButtonElement>('button[title="Play"]')?.click());
    await vi.waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toContain("NotSupportedError"));
    await act(async () => root.unmount());
    container.remove();
  });
});
