import { selectAudioDevice, setVadSensitivity, startAudioCapture, stopAudioCapture } from "../lib/sidecarClient";
import { useAudioStore, useSessionStore } from "../stores";
import type { SessionStatus } from "../types/state";

/**
 * Audio input selectors plus the device/channel/VAD handlers shared by the
 * status bar and the settings panel.
 */
export function useOperatorAudio(sessionStatus: SessionStatus) {
  const inputDevice = useAudioStore((s) => s.inputDevice);
  const inputChannel = useAudioStore((s) => s.inputChannel);
  const audioStatus = useAudioStore((s) => s.status);
  const audioError = useAudioStore((s) => s.lastError);
  const availableDevices = useAudioStore((s) => s.availableDevices);
  const vadSensitivity = useAudioStore((s) => s.vadSensitivity);
  const setAvailableDevices = useAudioStore((s) => s.setAvailableDevices);
  const setAudioDevice = useAudioStore((s) => s.setDevice);
  const setAudioChannel = useAudioStore((s) => s.setChannel);
  const setAudioSensitivity = useAudioStore((s) => s.setVadSensitivity);
  const setAudioStatus = useAudioStore((s) => s.setStatus);
  const levelRms = useAudioStore((s) => s.levelRms);
  const levelPeak = useAudioStore((s) => s.levelPeak);
  const isSpeech = useAudioStore((s) => s.isSpeech);
  const sessionLatencyMs = useSessionStore((s) => s.lastLatencyMs);
  const sessionUptimeSeconds = useSessionStore((s) => s.uptimeSeconds);

  const inputName = inputDevice?.name ?? "Select input device";
  const inputDevices = availableDevices.map((device) => device.name);
  const vadPercent = Math.round(vadSensitivity * 100);

  const handleAudioDeviceChange = (name: string) => {
    const selected = useAudioStore.getState().availableDevices.find((device) => device.name === name);
    if (!selected) return;

    void stopAudioCapture()
      .catch(() => undefined)
      .then(() => selectAudioDevice({ index: selected.index, channels: 1 }))
      .then(async ({ selected: device }) => {
        setAudioDevice(device);
        setAudioChannel(1);
        if (sessionStatus === "active") {
          const capture = await startAudioCapture();
          useAudioStore.getState().setCapturing(capture.capturing);
        }
      })
      .catch((error: unknown) => {
        setAudioDevice(null);
        useAudioStore.getState().setAudioError(error instanceof Error ? error.message : "Could not access this input device.");
      });
  };

  const handleAudioChannelChange = (channel: number) => {
    if (!inputDevice) return;

    void stopAudioCapture()
      .catch(() => undefined)
      .then(() => selectAudioDevice({ index: inputDevice.index, channels: channel }))
      .then(async ({ selected: device }) => {
        setAudioDevice(device);
        setAudioChannel(channel);
        if (sessionStatus === "active") {
          const capture = await startAudioCapture();
          useAudioStore.getState().setCapturing(capture.capturing);
        }
      })
      .catch((error: unknown) => {
        setAudioDevice(null);
        useAudioStore.getState().setAudioError(error instanceof Error ? error.message : "Could not access this input channel.");
      });
  };

  const handleVadPercentChange = (percent: number) => {
    const nextSensitivity = Math.max(0, Math.min(1, percent / 100));
    setAudioSensitivity(nextSensitivity);
    void setVadSensitivity(nextSensitivity).catch(() => undefined);
  };

  const handleVadSensitivityChange = (value: number) => {
    setAudioSensitivity(value);
    void setVadSensitivity(value).catch((error: unknown) => {
      useAudioStore.getState().setAudioError(error instanceof Error ? error.message : "Could not update speech detector sensitivity.");
    });
  };

  return {
    inputDevice,
    inputChannel,
    audioStatus,
    audioError,
    availableDevices,
    vadSensitivity,
    setAvailableDevices,
    setAudioDevice,
    setAudioStatus,
    levelRms,
    levelPeak,
    isSpeech,
    sessionLatencyMs,
    sessionUptimeSeconds,
    inputName,
    inputDevices,
    vadPercent,
    handleAudioDeviceChange,
    handleAudioChannelChange,
    handleVadPercentChange,
    handleVadSensitivityChange,
  };
}
