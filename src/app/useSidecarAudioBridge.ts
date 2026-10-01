import { useEffect } from "react";

import type { BranchAccount } from "../components/Auth/types";
import { getAudioDevices, getSidecarStatus, selectAudioDevice, startAudioCapture, stopAudioCapture } from "../lib/sidecarClient";
import { startSidecarWsBridge } from "../lib/sidecarWs";
import { useAudioStore } from "../stores";
import type { SessionStatus } from "../types/state";

type AudioStoreState = ReturnType<typeof useAudioStore.getState>;

export function useSidecarAudioBridge({
  authenticatedBranch,
  inputDevice,
  sessionStatus,
  setAudioDevice,
  setAudioStatus,
  setAvailableDevices,
}: {
  authenticatedBranch: BranchAccount | null;
  inputDevice: AudioStoreState["inputDevice"];
  sessionStatus: SessionStatus;
  setAudioDevice: AudioStoreState["setDevice"];
  setAudioStatus: AudioStoreState["setStatus"];
  setAvailableDevices: AudioStoreState["setAvailableDevices"];
}) {
  useEffect(() => {
    if (!authenticatedBranch) {
      return;
    }

    const stopBridge = startSidecarWsBridge();
    let cancelled = false;

    // The sidecar (python process spin-up + FastAPI startup) can take a few
    // seconds after `npx tauri dev` launches. Retry with backoff instead of
    // failing once and leaving the user stuck on a stale error.
    const initializeAudio = async () => {
      const maxAttempts = 12;
      let delay = 500;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (cancelled) return;
        try {
          const devicePayload = await getAudioDevices();
          if (cancelled) return;
          setAvailableDevices(devicePayload.devices);
          const selected =
            devicePayload.devices.find((d) => d.index === devicePayload.selected_index) ??
            devicePayload.devices.find((d) => /gk50 pro|usb audio/i.test(d.name)) ??
            devicePayload.devices.find((d) => d.isDefault) ??
            devicePayload.devices[0] ??
            null;
          if (selected) {
            const selection = await selectAudioDevice({ index: selected.index, channels: 1 });
            if (cancelled) return;
            setAudioDevice(selection.selected);
            useAudioStore.getState().setCapturing(false);
          }
          useAudioStore.getState().clearAudioError();
          return;
        } catch (error: unknown) {
          if (cancelled) return;
          const message = error instanceof Error ? error.message : "Waiting for the audio sidecar to become ready.";
          useAudioStore.getState().setAudioError(message);
          if (attempt === maxAttempts) return;
          await new Promise((resolve) => window.setTimeout(resolve, delay));
          delay = Math.min(delay * 1.6, 4000);
        }
      }
    };

    void initializeAudio();

    void (async () => {
      try {
        await getSidecarStatus();
      } catch {
        setAudioStatus("disconnected");
      }
    })();

    return () => {
      cancelled = true;
      stopBridge();
    };
  }, [authenticatedBranch, setAudioDevice, setAudioStatus, setAvailableDevices]);

  useEffect(() => {
    if (!authenticatedBranch || !inputDevice) {
      return;
    }

    if (sessionStatus !== "active") {
      void stopAudioCapture()
        .catch(() => undefined)
        .finally(() => useAudioStore.getState().setCapturing(false));
      return;
    }

    let cancelled = false;
    void startAudioCapture()
      .then((capture) => {
        if (!cancelled) useAudioStore.getState().setCapturing(capture.capturing);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          useAudioStore.getState().setAudioError(error instanceof Error ? error.message : "Could not start audio capture.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authenticatedBranch, inputDevice, sessionStatus]);
}
