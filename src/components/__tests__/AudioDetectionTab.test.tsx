// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AudioDetectionTab } from "../Settings/tabs/AudioDetectionTab";
import { DEFAULT_SETTINGS_PANEL_STATE } from "../Settings/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Audio Detection settings", () => {
  let container: HTMLDivElement;
  let root: Root;
  const refresh = vi.fn(async () => undefined);

  beforeEach(() => {
    refresh.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(status: "connected" | "capturing") {
    act(() => root.render(
      <AudioDetectionTab
        panelState={DEFAULT_SETTINGS_PANEL_STATE}
        onPanelChange={vi.fn()}
        audioDevices={[]}
        selectedDevice={null}
        inputChannel={1}
        audioStatus={status}
        audioError={null}
        vadSensitivity={0.5}
        onAudioDeviceChange={vi.fn()}
        onAudioDevicesRefresh={refresh}
        onAudioChannelChange={vi.fn()}
        onVadSensitivityChange={vi.fn()}
      />,
    ));
  }

  it("offers a manual scan and disables it while capturing", async () => {
    render("connected");
    const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("Scan for audio input devices"));
    expect(button).toBeDefined();

    await act(async () => { button?.click(); });
    expect(refresh).toHaveBeenCalledTimes(1);

    render("capturing");
    expect(button?.disabled).toBe(true);
  });
});
