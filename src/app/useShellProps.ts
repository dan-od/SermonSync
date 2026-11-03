import { AppLayout } from "../components/layout/AppLayout";
import { setVadSensitivity } from "../lib/sidecarClient";
import { useConfigStore, useProjectorStore, useSessionStore } from "../stores";
import type { useActiveModelProvider } from "./useActiveModelProvider";
import type { useAudioShell } from "./useAudioShell";
import type { useEngineStatus } from "./useEngineStatus";

export function useHeaderProps({
  handleFeedOverrideChange,
  setIsSummaryOpen,
  setHasOpenedNotes,
  setIsNotesOpen,
  setHasOpenedSettings,
  setIsSettingsOpen,
  setIsPresetDownloadsOpen,
}: {
  handleFeedOverrideChange: (mode: ReturnType<typeof useProjectorStore.getState>["feedOverride"]) => void;
  setIsSummaryOpen: (open: boolean) => void;
  setHasOpenedNotes: (opened: boolean) => void;
  setIsNotesOpen: (open: boolean) => void;
  setHasOpenedSettings: (opened: boolean) => void;
  setIsSettingsOpen: (open: boolean) => void;
  setIsPresetDownloadsOpen: (open: boolean) => void;
}) {
  const theme = useConfigStore((s) => s.theme);
  const setTheme = useConfigStore((s) => s.setTheme);
  const feedOverride = useProjectorStore((s) => s.feedOverride);
  const setOverlayMode = useProjectorStore((s) => s.setOverlayMode);
  const sessionStatus = useSessionStore((s) => s.status);
  const sessionStart = useSessionStore((s) => s.start);
  const sessionEnd = useSessionStore((s) => s.end);

  return {
    onOverlayModeChange: setOverlayMode,
    feedOverride,
    onFeedOverrideChange: handleFeedOverrideChange,
    uiTheme: theme,
    onUiThemeChange: setTheme,
    sessionStatus,
    onSessionStart: () => {
      const config = useConfigStore.getState();
      sessionStart(config.unitId, config.unitName);
    },
    onSessionEnd: sessionEnd,
    onSync: () => undefined,
    onOpenSummary: () => setIsSummaryOpen(true),
    onOpenNotes: () => {
      setHasOpenedNotes(true);
      setIsNotesOpen(true);
    },
    onOpenSettings: () => {
      setHasOpenedSettings(true);
      setIsSettingsOpen(true);
    },
    onOpenPresetDownloads: () => setIsPresetDownloadsOpen(true),
  } as unknown as Parameters<typeof AppLayout>[0]["header"];
}

export function useStatusProps({
  audio,
  engine,
  activeModelProvider,
}: {
  audio: ReturnType<typeof useAudioShell>;
  engine: ReturnType<typeof useEngineStatus>;
  activeModelProvider: ReturnType<typeof useActiveModelProvider>;
}): Parameters<typeof AppLayout>[0]["status"] {
  const sessionStatus = useSessionStore((s) => s.status);
  const { inputDevice, inputChannel, audioStatus, audioError, availableDevices, vadSensitivity, setAudioSensitivity, handleAudioDeviceChange, handleAudioChannelChange } = audio;
  const { engineVersion, engineModel, engineModelDegraded } = engine;
  const inputName = inputDevice?.name ?? "Select input device";
  const inputDevices = availableDevices.map((device) => device.name);
  const vadPercent = Math.round(vadSensitivity * 100);

  return {
    inputName,
    inputDevices,
    onInputNameChange: handleAudioDeviceChange,
    inputChannel: inputChannel,
    inputChannelCount: inputDevice?.channels ?? 1,
    audioStatus,
    audioError,
    onInputChannelChange: handleAudioChannelChange,
    isSessionLive: sessionStatus === "active",
    vadPercent,
    onVadPercentChange: (percent) => {
      const nextSensitivity = Math.max(0, Math.min(1, percent / 100));
      setAudioSensitivity(nextSensitivity);
      void setVadSensitivity(nextSensitivity).catch(() => undefined);
    },
    sampleRateLabel: `${inputDevice?.defaultSampleRate ?? 16000} Hz PCM`,
    engineVersion,
    engineModel,
    engineModelDegraded,
    locationLabel: "Foursquare Nigeria © 2026",
    modelProvider: activeModelProvider,
  };
}
