import type { SelectDeviceRequest, SelectDeviceResponse } from "../lib/sidecarClient";
import { useAudioStore } from "../stores";

export function useAudioDeviceHandlers({ inputDevice, setAudioDevice, setAudioChannel, selectCaptureDevice }: { inputDevice: ReturnType<typeof useAudioStore.getState>["inputDevice"]; setAudioDevice: ReturnType<typeof useAudioStore.getState>["setDevice"]; setAudioChannel: ReturnType<typeof useAudioStore.getState>["setChannel"]; selectCaptureDevice: (request: SelectDeviceRequest) => Promise<SelectDeviceResponse> }) {
  const handleAudioDeviceChange = (name: string) => {
    const selected = useAudioStore.getState().availableDevices.find((device) => device.name === name);
    if (!selected) return;

    void selectCaptureDevice({ index: selected.index, channels: 1 })
      .then(() => {
        setAudioDevice({ ...selected });
        setAudioChannel(1);
      })
      .catch((error: unknown) => {
        setAudioDevice(null);
        useAudioStore.getState().setAudioError(error instanceof Error ? error.message : "Could not access this input device.");
      });
  };

  const handleAudioChannelChange = (channel: number) => {
    if (!inputDevice) return;

    void selectCaptureDevice({ index: inputDevice.index, channels: channel })
      .then(({ selected: device }) => {
        setAudioDevice({ ...device });
        setAudioChannel(channel);
      })
      .catch((error: unknown) => {
        setAudioDevice(null);
        useAudioStore.getState().setAudioError(error instanceof Error ? error.message : "Could not access this input channel.");
      });
  };

  return { handleAudioDeviceChange, handleAudioChannelChange };
}
