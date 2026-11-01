import { type BranchAccount } from "../components/Auth/types";
import { useAudioStore } from "../stores";
import { type SessionStatus } from "../types/state";
import { useAudioDeviceHandlers } from "./useAudioDeviceHandlers";
import { useAudioPipeline } from "./useAudioPipeline";

export function useAudioShell(authenticatedBranch: BranchAccount | null, sessionStatus: SessionStatus) {
  const inputDevice = useAudioStore((s) => s.inputDevice);
  const inputChannel = useAudioStore((s) => s.inputChannel);
  const audioStatus = useAudioStore((s) => s.status);
  const audioError = useAudioStore((s) => s.lastError);
  const availableDevices = useAudioStore((s) => s.availableDevices);
  const vadSensitivity = useAudioStore((s) => s.vadSensitivity);
  const setAudioDevice = useAudioStore((s) => s.setDevice);
  const setAudioChannel = useAudioStore((s) => s.setChannel);
  const setAudioSensitivity = useAudioStore((s) => s.setVadSensitivity);

  const selectCaptureDevice = useAudioPipeline(authenticatedBranch, inputDevice, sessionStatus);

  const { handleAudioDeviceChange, handleAudioChannelChange } = useAudioDeviceHandlers({ inputDevice, setAudioDevice, setAudioChannel, selectCaptureDevice });

  return {
    inputDevice,
    inputChannel,
    audioStatus,
    audioError,
    availableDevices,
    vadSensitivity,
    setAudioSensitivity,
    handleAudioDeviceChange,
    handleAudioChannelChange,
  };
}
