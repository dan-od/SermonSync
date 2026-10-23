import { useCallback, useEffect, useRef } from "react";
import { type BranchAccount } from "../components/Auth/types";
import { getAudioDevices, getSidecarStatus, selectAudioDevice, setVadSensitivity, startAudioCapture, stopAudioCapture, type SelectDeviceRequest, type SelectDeviceResponse } from "../lib/sidecarClient";
import { startSidecarWsBridge } from "../lib/sidecarWs";
import { useAudioStore } from "../stores";

export function useAudioPipeline(authenticatedBranch: BranchAccount | null, inputDevice: ReturnType<typeof useAudioStore.getState>["inputDevice"], sessionStatus: string) {
  const setAvailableDevices = useAudioStore((s) => s.setAvailableDevices);
  const setAudioDevice = useAudioStore((s) => s.setDevice);
  const setAudioChannel = useAudioStore((s) => s.setChannel);
  const setAudioStatus = useAudioStore((s) => s.setStatus);
  const captureQueueRef = useRef<Promise<void>>(Promise.resolve());
  const captureRevisionRef = useRef(0);
  const captureAttemptedRef = useRef(false);

  const selectCaptureDevice = useCallback((request: SelectDeviceRequest): Promise<SelectDeviceResponse> => {
    const revision = ++captureRevisionRef.current;
    const selection = captureQueueRef.current.catch(() => undefined).then(async () => {
      await stopAudioCapture().catch(() => undefined);
      const result = await selectAudioDevice(request);
      if (revision === captureRevisionRef.current) {
        captureAttemptedRef.current = false;
        useAudioStore.getState().setCapturing(false);
      }
      return result;
    });
    captureQueueRef.current = selection.then(() => undefined, () => undefined);
    return selection;
  }, []);

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
          const savedAudioSettings = useAudioStore.getState();
          setAvailableDevices(devicePayload.devices);
          const selected =
            devicePayload.devices.find((d) => d.name === savedAudioSettings.preferredDeviceName) ??
            devicePayload.devices.find((d) => d.index === devicePayload.selected_index) ??
            devicePayload.devices.find((d) => /gk50 pro|usb audio/i.test(d.name)) ??
            devicePayload.devices.find((d) => d.isDefault) ??
            devicePayload.devices[0] ??
            null;
          if (selected) {
            const restoredChannel = Math.min(Math.max(1, savedAudioSettings.preferredChannel), selected.channels);
            await selectCaptureDevice({ index: selected.index, channels: restoredChannel });
            if (cancelled) return;
            setAudioDevice(selected);
            setAudioChannel(restoredChannel);
            useAudioStore.getState().setCapturing(false);
          }
          // The detector is a separate process, so restore the persisted UI
          // value whenever that process becomes ready after launch/restart.
          await setVadSensitivity(useAudioStore.getState().vadSensitivity);
          if (cancelled) return;
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
  }, [authenticatedBranch, selectCaptureDevice, setAudioChannel, setAudioDevice, setAudioStatus, setAvailableDevices]);

  useEffect(() => {
    const shouldCapture = Boolean(authenticatedBranch && inputDevice && sessionStatus === "active");
    if (!shouldCapture && !captureAttemptedRef.current) return;
    if (shouldCapture) captureAttemptedRef.current = true;
    const revision = ++captureRevisionRef.current;

    // PortAudio start/stop calls can take time. Keep requests ordered and omit
    // transitions superseded before they reach the sidecar.
    captureQueueRef.current = captureQueueRef.current.catch(() => undefined).then(async () => {
      if (revision !== captureRevisionRef.current) return;
      if (shouldCapture) {
        try {
          const capture = await startAudioCapture();
          if (revision === captureRevisionRef.current) useAudioStore.getState().setCapturing(capture.capturing);
        } catch (error) {
          if (revision === captureRevisionRef.current) {
            useAudioStore.getState().setAudioError(error instanceof Error ? error.message : "Could not start audio capture.");
          }
        }
      } else {
        await stopAudioCapture().catch(() => undefined);
        if (revision === captureRevisionRef.current) {
          captureAttemptedRef.current = false;
          useAudioStore.getState().setCapturing(false);
        }
      }
    });

    return () => {
      if (captureRevisionRef.current === revision) captureRevisionRef.current += 1;
    };
  }, [authenticatedBranch, inputDevice, sessionStatus]);

  return selectCaptureDevice;
}
