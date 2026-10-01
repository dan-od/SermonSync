import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LazyPanelFallback } from "./app/LazyPanelFallback";
import { LocalLibrarySearch } from "./app/LocalLibrarySearch";
import { SessionSummaryDialog } from "./app/SessionSummaryDialog";
import { WorkspaceCenterPanel } from "./app/WorkspaceCenterPanel";
import { buildDbTables } from "./app/dbTables";
import { createLibraryScheduleActions } from "./app/libraryScheduleActions";
import { shellReset } from "./app/shellReset";
import { formatReference, toSlide } from "./app/slideHelpers";
import { createSuggestionActions } from "./app/suggestionActions";
import type { LibraryScheduleItem } from "./app/types";
import { useActiveModelProvider } from "./app/useActiveModelProvider";
import { useEngineStatus } from "./app/useEngineStatus";
import { useOperatorAudio } from "./app/useOperatorAudio";
import { useOperatorShortcuts } from "./app/useOperatorShortcuts";
import { useSessionTimer } from "./app/useSessionTimer";
import { useSidecarAudioBridge } from "./app/useSidecarAudioBridge";
import { AuthGate } from "./components/Auth/AuthGate";
import type { BranchAccount } from "./components/Auth/types";
import { LaunchScreen } from "./components/Launch/LaunchScreen";
import { SettingsPanel } from "./components/Settings/SettingsPanel";
import { CueProjectionModal } from "./components/Songs/CueProjectionModal";
import { TranscriptTimelinePanel } from "./components/TranscriptTimelinePanel";
import type { DbTable } from "./components/desktop/uiTypes";
import { AppLayout } from "./components/layout/AppLayout";
import type { LibraryNavigationHandler, LibraryTab, ScriptureSearchMode } from "./components/LocalLibraryPanel";
import { useProjectorOutputBridge } from "./lib/useProjectorOutputBridge";
import {
  useConfigStore,
  useProjectorStore,
  useSessionStore,
  useSuggestionStore,
  useTemplateStore,
  useTranscriptionStore,
} from "./stores";
import { useShortcutStore } from "./stores/shortcutStore";

const LocalLibraryPanel = lazy(() => import("./components/LocalLibraryPanel").then((module) => ({ default: module.LocalLibraryPanel })));
const ProjectorDeskPanel = lazy(() => import("./components/ProjectorDeskPanel").then((module) => ({ default: module.ProjectorDeskPanel })));

function App() {
  const [workspaceTab, setWorkspaceTab] = useState<"suggestions" | "bible" | "notes" | "database">("suggestions");
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isSummaryCloseHovered, setIsSummaryCloseHovered] = useState(false);
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("scriptures");
  const [librarySearchQuery, setLibrarySearchQuery] = useState("");
  const [librarySearchMode, setLibrarySearchMode] = useState<ScriptureSearchMode>("words");
  const [librarySchedule, setLibrarySchedule] = useState<LibraryScheduleItem[]>([]);
  const [activeCue, setActiveCue] = useState<LibraryScheduleItem | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showLaunchScreen, setShowLaunchScreen] = useState(true);
  const [authenticatedBranch, setAuthenticatedBranch] = useState<BranchAccount | null>(null);
  const libraryNavigationRef = useRef<LibraryNavigationHandler | null>(null);
  // SS-036: mirror the LIVE stage to the congregation output window.
  useProjectorOutputBridge();

  const theme = useConfigStore((s) => s.theme);
  const setTheme = useConfigStore((s) => s.setTheme);
  const setUnit = useConfigStore((s) => s.setUnit);
  const activeModelProvider = useActiveModelProvider();

  const transcripts = useTranscriptionStore((s) => s.timeline);
  // Interim hypotheses arrive while the speaker is still talking; the sidecar
  // bridge clears this on each finalized sentence.
  const interimText = useTranscriptionStore((s) => s.latestPartial);
  const addManualTimelineItem = useTranscriptionStore((s) => s.addManualTimelineItem);

  const { engineVersion, engineModel, engineModelDegraded } = useEngineStatus();

  const cards = useSuggestionStore((s) => s.cards);
  const addCards = useSuggestionStore((s) => s.addCards);
  const updateCardStatus = useSuggestionStore((s) => s.updateStatus);
  const togglePinnedSuggestion = useSuggestionStore((s) => s.togglePin);
  const dismissSuggestion = useSuggestionStore((s) => s.dismiss);
  const clearSuggestions = useSuggestionStore((s) => s.clear);

  const previewSlide = useProjectorStore((s) => s.previewSlide);
  const liveSlide = useProjectorStore((s) => s.liveSlide);
  const overlayMode = useProjectorStore((s) => s.overlayMode);
  const projectorTheme = useProjectorStore((s) => s.theme);
  const feedOverride = useProjectorStore((s) => s.feedOverride);
  const setPreviewSlide = useProjectorStore((s) => s.setPreview);
  const sendLiveSlide = useProjectorStore((s) => s.sendLive);
  const setOverlayMode = useProjectorStore((s) => s.setOverlayMode);
  const setFeedOverride = useProjectorStore((s) => s.setFeedOverride);
  const shortcuts = useShortcutStore((s) => s.shortcuts);
  const initializeTemplates = useTemplateStore((s) => s.initialize);

  useEffect(() => {
    void initializeTemplates();
  }, [initializeTemplates]);

  const sessionStatus = useSessionStore((s) => s.status);
  const sessionId = useSessionStore((s) => s.id);
  const sessionElapsed = useSessionStore((s) => s.elapsed);
  const sessionStart = useSessionStore((s) => s.start);
  const sessionEnd = useSessionStore((s) => s.end);
  const sessionTick = useSessionStore((s) => s.tick);
  const sessionStartTime = useSessionStore((s) => s.startTime);

  const {
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
  } = useOperatorAudio(sessionStatus);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    void useConfigStore.getState().hydrateProviderKeys();
  }, []);

  useSidecarAudioBridge({ authenticatedBranch, inputDevice, sessionStatus, setAudioDevice, setAudioStatus, setAvailableDevices });

  useSessionTimer(sessionStatus, sessionStartTime, sessionTick);

  const dbTables = useMemo<DbTable[]>(
    () => buildDbTables({ transcripts, cards, previewSlide, liveSlide, overlayMode, projectorTheme }),
    [cards, liveSlide, overlayMode, previewSlide, projectorTheme, transcripts],
  );

  const previewReference = previewSlide ? formatReference(previewSlide) : null;
  const liveReference = liveSlide ? formatReference(liveSlide) : null;

  const { addManualTranscript, sendLiveCard, sendEditedCardLive } = createSuggestionActions({
    addManualTimelineItem,
    addCards,
    updateCardStatus,
    setPreviewSlide,
    sendLiveSlide,
    setWorkspaceTab,
  });

  const handleFeedOverrideChange = useCallback((mode: typeof feedOverride) => {
    setFeedOverride(mode);
  }, [setFeedOverride]);

  const cycleLive = useCallback((direction: -1 | 1) => {
    if (!libraryNavigationRef.current) return;
    setPreviewSlide(null);
    libraryNavigationRef.current(direction);
  }, [setPreviewSlide]);

  useOperatorShortcuts({
    isSettingsOpen,
    setIsSettingsOpen,
    shortcuts,
    previewSlide,
    cycleLive,
    handleFeedOverrideChange,
    setOverlayMode,
    sendLiveSlide,
  });

  const {
    addLibraryScheduleItem,
    removeLibraryScheduleItem,
    addCueToSchedule,
    openCueFromSchedule,
    previewScheduledItem,
    sendScheduledItemLive,
  } = createLibraryScheduleActions({
    libraryTab,
    librarySearchQuery,
    librarySearchMode,
    setLibrarySearchQuery,
    setLibrarySchedule,
    setActiveCue,
    setPreviewSlide,
    sendLiveSlide,
  });

  const centerPanel = (
    <WorkspaceCenterPanel
      workspaceTab={workspaceTab}
      cards={cards}
      transcripts={transcripts}
      dbTables={dbTables}
      previewReference={previewReference}
      onPreviewCard={(card) => setPreviewSlide(toSlide(card))}
      onSendLive={sendLiveCard}
      onSendEditedLive={sendEditedCardLive}
      onTogglePin={(card) => togglePinnedSuggestion(card.id)}
      onDismiss={dismissSuggestion}
      onClearAll={clearSuggestions}
      onPreviewSlide={setPreviewSlide}
    />
  );

  const headerProps = {
    activeTab: workspaceTab,
    onTabChange: setWorkspaceTab,
    overlayMode,
    onOverlayModeChange: setOverlayMode,
    feedOverride,
    onFeedOverrideChange: handleFeedOverrideChange,
    uiTheme: theme,
    onUiThemeChange: setTheme,
    sessionStatus,
    sessionElapsedSeconds: sessionElapsed,
    onSessionStart: () => {
      const config = useConfigStore.getState();
      sessionStart(config.unitId, config.unitName);
    },
    onSessionEnd: sessionEnd,
    onOpenSummary: () => setIsSummaryOpen(true),
    onOpenSettings: () => setIsSettingsOpen(true),
  } as unknown as Parameters<typeof AppLayout>[0]["header"];

  const projectorDeskProps = {
    previewSlide,
    liveSlide,
    feedOverride,
    overlayMode,
    onOverlayModeChange: setOverlayMode,
    theme: projectorTheme,
    onSendLive: () => {
      if (previewSlide) {
        sendLiveSlide(previewSlide);
      }
    },
    onPrevious: () => cycleLive(-1),
    onNext: () => cycleLive(1),
  };

  if (showLaunchScreen) {
    return (
      <>
        <style>{shellReset}</style>
        <LaunchScreen onProceedToAuth={() => setShowLaunchScreen(false)} />
      </>
    );
  }

  if (!authenticatedBranch) {
    return (
      <>
        <style>{shellReset}</style>
        <AuthGate
          onAuthenticated={(branch) => {
            setUnit(branch.id, branch.name);
            setAuthenticatedBranch(branch);
          }}
        />
      </>
    );
  }

  return (
    <>
      <style>{shellReset}</style>
      <AppLayout
        header={headerProps}
        status={{
          inputName,
          inputDevices,
          onInputNameChange: handleAudioDeviceChange,
          inputChannel: inputChannel,
          inputChannelCount: inputDevice?.channels ?? 1,
          audioStatus,
          audioError,
          onInputChannelChange: handleAudioChannelChange,
          isSessionLive: sessionStatus === "active",
          onSync: () => undefined,
          vadPercent,
          onVadPercentChange: handleVadPercentChange,
          sampleRateLabel: `${inputDevice?.defaultSampleRate ?? 16000} Hz PCM`,
          engineVersion,
          engineModel,
          engineModelDegraded,
          locationLabel: "Foursquare Nigeria © 2026",
          latencyMs: sessionLatencyMs,
          uptimeSeconds: sessionUptimeSeconds,
          levelRms,
          levelPeak,
          isSpeech,
          modelProvider: activeModelProvider,
        }}
        leftPanel={
          <TranscriptTimelinePanel
            items={transcripts}
            onAddManualTranscript={addManualTranscript}
            interimText={interimText}
          />
        }
        centerPanel={centerPanel}
        rightPanel={
          <Suspense fallback={<LazyPanelFallback />}>
            <ProjectorDeskPanel {...projectorDeskProps} />
          </Suspense>
        }
        library={
          <Suspense fallback={<LazyPanelFallback />}>
            <LocalLibraryPanel
              previewReference={previewReference}
              liveReference={liveReference}
              activeTab={libraryTab}
              searchQuery={librarySearchQuery}
              searchMode={librarySearchMode}
              onActiveTabChange={setLibraryTab}
              onPreviewSlide={setPreviewSlide}
              onSendLive={sendLiveSlide}
              onAddToSchedule={addLibraryScheduleItem}
              onCreateCue={addCueToSchedule}
              onNavigationHandlerChange={(handler) => {
                libraryNavigationRef.current = handler;
              }}
            />
          </Suspense>
        }
        librarySidePanel={
          <LocalLibrarySearch
            activeTab={libraryTab}
            searchQuery={librarySearchQuery}
            onSearchQueryChange={setLibrarySearchQuery}
            searchMode={librarySearchMode}
            onSearchModeChange={setLibrarySearchMode}
            scheduledItems={librarySchedule}
            onAddToSchedule={addLibraryScheduleItem}
            onRemoveFromSchedule={removeLibraryScheduleItem}
            onSchedulePreview={previewScheduledItem}
            onScheduleLive={sendScheduledItemLive}
            onOpenCue={openCueFromSchedule}
          />
        }
      />
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
        levelRms={levelRms}
        levelPeak={levelPeak}
        vadSensitivity={vadSensitivity}
        onAudioDeviceChange={handleAudioDeviceChange}
        onAudioChannelChange={handleAudioChannelChange}
        onVadSensitivityChange={handleVadSensitivityChange}
      />
      {isSummaryOpen ? (
        <SessionSummaryDialog
          isCloseHovered={isSummaryCloseHovered}
          onCloseHoveredChange={setIsSummaryCloseHovered}
          onClose={() => setIsSummaryOpen(false)}
          transcripts={transcripts}
          cards={cards}
          sessionStatus={sessionStatus}
          sessionElapsed={sessionElapsed}
          sessionId={sessionId}
        />
      ) : null}
      {activeCue?.cueSlides && (
        <CueProjectionModal
          title={activeCue.value}
          slides={activeCue.cueSlides}
          onClose={() => setActiveCue(null)}
          onSendLive={sendLiveSlide}
        />
      )}
    </>
  );
}

export default App;
