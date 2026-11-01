import { Suspense, useEffect, useRef, useState } from "react";
import { AuthGate } from "./components/Auth/AuthGate";
import { type BranchAccount } from "./components/Auth/types";
import { LaunchScreen } from "./components/Launch/LaunchScreen";
import { TranscriptTimelinePanel } from "./components/TranscriptTimelinePanel";
import { AppLayout } from "./components/layout/AppLayout";
import { EngineFailureBanner } from "./components/layout/EngineFailureBanner";
import type { LibraryNavigationHandler, LibraryTab, ScriptureSearchMode } from "./components/Library/types";
import { useConfigStore, useProjectorStore, useSessionStore, useTemplateStore, useTranscriptionStore } from "./stores";
import { useShortcutStore } from "./stores/shortcutStore";
import { type Song } from "./stores/songStore";
import { type ProjectorSlide } from "./types/state";
import { type LibraryScheduleItem } from "./app/types";
import { formatReference } from "./app/helpers";
import { shellReset } from "./app/shellStyles";
import { AppModals } from "./app/AppModals";
import { LazyPanelFallback } from "./app/LazyPanelFallback";
import { WorkspaceCenterPanel } from "./app/WorkspaceCenterPanel";
import { useActiveModelProvider } from "./app/useActiveModelProvider";
import { useAppCloseHandler } from "./app/useAppCloseHandler";
import { useAudioShell } from "./app/useAudioShell";
import { useDbTables } from "./app/useDbTables";
import { useFeedControls } from "./app/useFeedControls";
import { useLibraryPanels } from "./app/useLibraryPanels";
import { useEngineStatus } from "./app/useEngineStatus";
import { useProjectorOutputBridge } from "./app/useProjectorOutputBridge";
import { useDisplayManagement } from "./app/useDisplayManagement";
import { useHeaderProps, useStatusProps } from "./app/useShellProps";
import { useSuggestionHandlers } from "./app/useSuggestionHandlers";
import { useThemeAttribute } from "./app/useThemeAttribute";
import { useSessionTicker } from "./app/useSessionTicker";
import { useShortcutHandlers } from "./app/useShortcutHandlers";
import { ProjectorDeskPanel } from "./app/lazyPanels";

function App() {
  const [workspaceTab, setWorkspaceTab] = useState<"suggestions" | "bible" | "notes" | "database">("suggestions");
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isPresetDownloadsOpen, setIsPresetDownloadsOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [hasOpenedNotes, setHasOpenedNotes] = useState(false);
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("scriptures");
  const [librarySearchQuery, setLibrarySearchQuery] = useState("");
  const [librarySearchMode, setLibrarySearchMode] = useState<ScriptureSearchMode>("words");
  const [selectedScripture, setSelectedScripture] = useState<ProjectorSlide | null>(null);
  const [selectedLibrarySong, setSelectedLibrarySong] = useState<Song | null>(null);
  const [activeCue, setActiveCue] = useState<LibraryScheduleItem | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [hasOpenedSettings, setHasOpenedSettings] = useState(false);
  const [showLaunchScreen, setShowLaunchScreen] = useState(true);
  const [authenticatedBranch, setAuthenticatedBranch] = useState<BranchAccount | null>(null);
  const libraryNavigationRef = useRef<LibraryNavigationHandler | null>(null);

  const theme = useConfigStore((s) => s.theme);
  const setUnit = useConfigStore((s) => s.setUnit);

  const transcripts = useTranscriptionStore((s) => s.timeline);

  const engine = useEngineStatus(Boolean(authenticatedBranch));
  const { engineLoadError } = engine;

  const previewSlide = useProjectorStore((s) => s.previewSlide);
  const liveSlide = useProjectorStore((s) => s.liveSlide);
  const previewMedia = useProjectorStore((s) => s.previewMedia);
  const liveMedia = useProjectorStore((s) => s.liveMedia);
  // The layout picker updates the projector views directly. Avoid rendering the
  // entire library, search results, and timeline for every layout switch.
  const inspectedOverlayMode = useProjectorStore((s) => workspaceTab === "database" ? s.overlayMode : null);
  const overlayMode = inspectedOverlayMode ?? useProjectorStore.getState().overlayMode;
  const projectorTheme = useProjectorStore((s) => s.theme);
  const feedOverride = useProjectorStore((s) => s.feedOverride);
  const outputStatus = useProjectorStore((s) => s.outputStatus);
  const sendLiveSlide = useProjectorStore((s) => s.sendLive);
  const setOverlayMode = useProjectorStore((s) => s.setOverlayMode);

  useProjectorOutputBridge();

  useDisplayManagement(outputStatus);

  const shortcuts = useShortcutStore((s) => s.shortcuts);
  const initializeTemplates = useTemplateStore((s) => s.initialize);

  useEffect(() => {
    void initializeTemplates();
  }, [initializeTemplates]);

  const sessionStatus = useSessionStore((s) => s.status);
  const sessionTick = useSessionStore((s) => s.tick);
  const sessionStartTime = useSessionStore((s) => s.startTime);

  useAppCloseHandler();

  useThemeAttribute(theme);

  useEffect(() => {
    void useConfigStore.getState().hydrateProviderKeys();
  }, []);

  const audio = useAudioShell(authenticatedBranch, sessionStatus);

  useSessionTicker(sessionStartTime, sessionStatus, sessionTick);

  const dbTables = useDbTables(overlayMode);

  const previewReference = previewSlide ? formatReference(previewSlide) : null;
  const liveReference = liveSlide ? formatReference(liveSlide) : null;

  const { addManualTranscript, sendLiveCard, sendEditedCardLive } = useSuggestionHandlers(setWorkspaceTab);
  const { handleFeedOverrideChange, toggleFeedOverride, cycleLive } = useFeedControls(libraryNavigationRef);

  useShortcutHandlers({ cycleLive, handleFeedOverrideChange, isSettingsOpen, previewSlide, sendLiveSlide, setOverlayMode, setLibraryTab, setIsSettingsOpen, shortcuts, toggleFeedOverride });

  const { library, librarySidePanel } = useLibraryPanels({
    libraryTab,
    setLibraryTab,
    librarySearchQuery,
    setLibrarySearchQuery,
    librarySearchMode,
    setLibrarySearchMode,
    selectedScripture,
    setSelectedScripture,
    selectedLibrarySong,
    setSelectedLibrarySong,
    setActiveCue,
    previewReference,
    liveReference,
    libraryNavigationRef,
  });

  const headerProps = useHeaderProps({ handleFeedOverrideChange, setIsSummaryOpen, setHasOpenedNotes, setIsNotesOpen, setHasOpenedSettings, setIsSettingsOpen, setIsPresetDownloadsOpen });
  const activeModelProvider = useActiveModelProvider();
  const statusProps = useStatusProps({ audio, engine, activeModelProvider });

  const projectorDeskProps = {
    previewSlide,
    liveSlide,
    previewMedia,
    liveMedia,
    feedOverride,
    onOverlayModeChange: setOverlayMode,
    theme: projectorTheme,
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
        alert={engineLoadError ? <EngineFailureBanner error={engineLoadError} /> : null}
        status={statusProps}
        leftPanel={
          <TranscriptTimelinePanel
            items={transcripts}
            onAddManualTranscript={addManualTranscript}
          />
        }
        centerPanel={
          <WorkspaceCenterPanel
            workspaceTab={workspaceTab}
            previewReference={previewReference}
            dbTables={dbTables}
            sendLiveCard={sendLiveCard}
            sendEditedCardLive={sendEditedCardLive}
          />
        }
        rightPanel={
          <Suspense fallback={<LazyPanelFallback />}>
            <ProjectorDeskPanel {...projectorDeskProps} />
          </Suspense>
        }
        library={library}
        librarySidePanel={librarySidePanel}
      />
      <AppModals
        hasOpenedSettings={hasOpenedSettings}
        isSettingsOpen={isSettingsOpen}
        setIsSettingsOpen={setIsSettingsOpen}
        isSummaryOpen={isSummaryOpen}
        setIsSummaryOpen={setIsSummaryOpen}
        activeCue={activeCue}
        setActiveCue={setActiveCue}
        isPresetDownloadsOpen={isPresetDownloadsOpen}
        setIsPresetDownloadsOpen={setIsPresetDownloadsOpen}
        hasOpenedNotes={hasOpenedNotes}
        isNotesOpen={isNotesOpen}
        setIsNotesOpen={setIsNotesOpen}
        audio={audio}
      />
    </>
  );
}

export default App;
