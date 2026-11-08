import { Suspense, useCallback, useState } from "react";
import { NotesModal } from "../components/NotesModal";
import { setVadSensitivity } from "../lib/sidecarClient";
import { useAudioStore, useConfigStore, useProjectorStore, useSessionStore, useSuggestionStore, useTranscriptionStore } from "../stores";
import { type LibraryScheduleItem } from "./types";
import { LazyPanelFallback } from "./LazyPanelFallback";
import { CueProjectionModal, DownloadAppPresetsModal, SessionSummaryPanel, SettingsPanel } from "./lazyPanels";
import type { useAudioShell } from "./useAudioShell";

export function AppModals({
  hasOpenedSettings,
  isSettingsOpen,
  setIsSettingsOpen,
  isSummaryOpen,
  setIsSummaryOpen,
  activeCue,
  setActiveCue,
  isPresetDownloadsOpen,
  setIsPresetDownloadsOpen,
  hasOpenedNotes,
  isNotesOpen,
  setIsNotesOpen,
  audio,
}: {
  hasOpenedSettings: boolean;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  isSummaryOpen: boolean;
  setIsSummaryOpen: (open: boolean) => void;
  activeCue: LibraryScheduleItem | null;
  setActiveCue: (cue: LibraryScheduleItem | null) => void;
  isPresetDownloadsOpen: boolean;
  setIsPresetDownloadsOpen: (open: boolean) => void;
  hasOpenedNotes: boolean;
  isNotesOpen: boolean;
  setIsNotesOpen: (open: boolean) => void;
  audio: ReturnType<typeof useAudioShell>;
}) {
  const [isSummaryCloseHovered, setIsSummaryCloseHovered] = useState(false);
  const theme = useConfigStore((s) => s.theme);
  const setTheme = useConfigStore((s) => s.setTheme);
  const transcripts = useTranscriptionStore((s) => s.timeline);
  const cards = useSuggestionStore((s) => s.cards);
  const sendLiveSlide = useProjectorStore((s) => s.sendLive);
  const sessionStatus = useSessionStore((s) => s.status);
  const sessionId = useSessionStore((s) => s.id);
  const closeNotesModal = useCallback(() => setIsNotesOpen(false), [setIsNotesOpen]);
  const { inputDevice, inputChannel, audioStatus, audioError, availableDevices, vadSensitivity, setAudioSensitivity, handleAudioDeviceScan, handleAudioDeviceChange, handleAudioChannelChange } = audio;

  return (
    <>
      {hasOpenedSettings ? (
        <Suspense fallback={<LazyPanelFallback />}>
          <SettingsPanel
            open={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            uiTheme={theme}
            onUiThemeChange={setTheme}
            audioDevices={availableDevices}
            selectedDevice={inputDevice}
            inputChannel={inputChannel}
            audioStatus={audioStatus}
            audioError={audioError}
            vadSensitivity={vadSensitivity}
            onAudioDeviceChange={handleAudioDeviceChange}
            onAudioDevicesRefresh={handleAudioDeviceScan}
            onAudioChannelChange={handleAudioChannelChange}
            onVadSensitivityChange={(value) => {
              setAudioSensitivity(value);
              void setVadSensitivity(value).catch((error: unknown) => {
                useAudioStore.getState().setAudioError(error instanceof Error ? error.message : "Could not update speech detector sensitivity.");
              });
            }}
          />
        </Suspense>
      ) : null}
      {isSummaryOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Session summary"
          style={{ position: "fixed", inset: 0, zIndex: 1200, padding: "48px 6vw 6vh", background: "color-mix(in srgb, var(--bg-base) 72%, transparent)", backdropFilter: "blur(8px)" }}
        >
          <div style={{ height: "100%", overflow: "hidden", background: "var(--bg-base)", boxShadow: "var(--shadow-lg)" }}>
            <div style={{ height: "100%", position: "relative" }}>
              <button
                type="button"
                onClick={() => setIsSummaryOpen(false)}
                onMouseEnter={() => setIsSummaryCloseHovered(true)}
                onMouseLeave={() => setIsSummaryCloseHovered(false)}
                aria-label="Close session summary"
                title="Close summary"
                style={{ position: "absolute", top: 14, right: 16, zIndex: 2, border: "none", background: isSummaryCloseHovered ? "var(--color-primary)" : "var(--bg-elevated)", color: isSummaryCloseHovered ? "var(--fg-on-accent)" : "var(--fg-muted)", width: 28, height: 28, cursor: "pointer", fontSize: 18, lineHeight: 1, transition: "background-color 120ms ease, color 120ms ease" }}
              >
                ×
              </button>
              <Suspense fallback={<LazyPanelFallback />}>
                <SessionSummaryPanel
                  key={sessionId ?? sessionStatus}
                  items={transcripts}
                  cards={cards}
                  sessionStatus={sessionStatus}
                  sessionId={sessionId}
                />
              </Suspense>
            </div>
          </div>
        </div>
      ) : null}
      {activeCue?.cueSlides ? (
        <Suspense fallback={<LazyPanelFallback />}>
          <CueProjectionModal
            title={activeCue.value}
            slides={activeCue.cueSlides}
            onClose={() => setActiveCue(null)}
            onSendLive={sendLiveSlide}
          />
        </Suspense>
      ) : null}
      {isPresetDownloadsOpen ? (
        <Suspense fallback={<LazyPanelFallback />}>
          <DownloadAppPresetsModal onClose={() => setIsPresetDownloadsOpen(false)} />
        </Suspense>
      ) : null}
      {hasOpenedNotes ? (
        <NotesModal
          open={isNotesOpen}
          items={transcripts}
          pendingCount={cards.filter((card) => card.status === "pending").length}
          onClose={closeNotesModal}
        />
      ) : null}
    </>
  );
}
