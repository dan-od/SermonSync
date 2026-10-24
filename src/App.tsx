import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AuthGate } from "./components/Auth/AuthGate";
import { type BranchAccount } from "./components/Auth/types";
import { LaunchScreen } from "./components/Launch/LaunchScreen";
import { TranscriptTimelinePanel } from "./components/TranscriptTimelinePanel";
import { NotesModal } from "./components/NotesModal";
import { type DbTable } from "./components/desktop/uiTypes";
import { AppLayout } from "./components/layout/AppLayout";
import type { LibraryNavigationHandler, LibraryTab, ScriptureSearchMode } from "./components/Library/types";
import { setVadSensitivity } from "./lib/sidecarClient";
import { useAudioStore, useConfigStore, useProjectorStore, useSessionStore, useSuggestionStore, useTemplateStore, useTranscriptionStore } from "./stores";
import { useShortcutStore } from "./stores/shortcutStore";
import { type Song } from "./stores/songStore";
import { type ProjectorSlide, type SuggestionCard } from "./types/state";
import { type LibraryScheduleItem } from "./app/types";
import { formatReference, toSlide } from "./app/helpers";
import { shellReset } from "./app/shellStyles";
import { passageLibrary } from "./app/passageLibrary";
import { LazyPanelFallback } from "./app/LazyPanelFallback";
import { useLibrarySchedule } from "./app/useLibrarySchedule";
import { useEngineStatus } from "./app/useEngineStatus";
import { useProjectorOutputBridge } from "./app/useProjectorOutputBridge";
import { useDisplayManagement } from "./app/useDisplayManagement";
import { useThemeAttribute } from "./app/useThemeAttribute";
import { useAudioPipeline } from "./app/useAudioPipeline";
import { useSessionTicker } from "./app/useSessionTicker";
import { useShortcutHandlers } from "./app/useShortcutHandlers";
import { useAudioDeviceHandlers } from "./app/useAudioDeviceHandlers";
import { LocalLibrarySearch } from "./app/LocalLibrarySearch";
import { AiPanel, BiblePanel, CueProjectionModal, DbInspectorPanel, DownloadAppPresetsModal, LocalLibraryPanel, ProjectorDeskPanel, SessionSummaryPanel, SettingsPanel, SuggestionDeckPanel } from "./app/lazyPanels";

function App() {
  const [workspaceTab, setWorkspaceTab] = useState<"suggestions" | "bible" | "notes" | "database">("suggestions");
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isPresetDownloadsOpen, setIsPresetDownloadsOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [hasOpenedNotes, setHasOpenedNotes] = useState(false);
  const [isSummaryCloseHovered, setIsSummaryCloseHovered] = useState(false);
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
  const setTheme = useConfigStore((s) => s.setTheme);
  const setUnit = useConfigStore((s) => s.setUnit);
  const groqApiKey = useConfigStore((s) => s.groqApiKey);
  const groqEnabled = useConfigStore((s) => s.groqEnabled);
  const modelProviderKeys = useConfigStore((s) => s.modelProviderKeys);
  const defaultModelProvider = useConfigStore((s) => s.defaultModelProvider);

  const transcripts = useTranscriptionStore((s) => s.timeline);
  const addManualTimelineItem = useTranscriptionStore((s) => s.addManualTimelineItem);

  const { engineVersion, engineModel, engineModelDegraded } = useEngineStatus(Boolean(authenticatedBranch));

  const cards = useSuggestionStore((s) => s.cards);
  const addCards = useSuggestionStore((s) => s.addCards);
  const updateCardStatus = useSuggestionStore((s) => s.updateStatus);
  const togglePinnedSuggestion = useSuggestionStore((s) => s.togglePin);
  const dismissSuggestion = useSuggestionStore((s) => s.dismiss);
  const clearSuggestions = useSuggestionStore((s) => s.clear);

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
  const setPreviewSlide = useProjectorStore((s) => s.setPreview);
  const setPreviewMedia = useProjectorStore((s) => s.setPreviewMedia);
  const sendLiveSlide = useProjectorStore((s) => s.sendLive);
  const sendLiveMedia = useProjectorStore((s) => s.sendLiveMedia);
  const setOverlayMode = useProjectorStore((s) => s.setOverlayMode);
  const setFeedOverride = useProjectorStore((s) => s.setFeedOverride);
  const closeNotesModal = useCallback(() => setIsNotesOpen(false), []);

  useProjectorOutputBridge();

  useDisplayManagement(outputStatus);

  const shortcuts = useShortcutStore((s) => s.shortcuts);
  const initializeTemplates = useTemplateStore((s) => s.initialize);

  useEffect(() => {
    void initializeTemplates();
  }, [initializeTemplates]);

  const sessionStatus = useSessionStore((s) => s.status);
  const sessionId = useSessionStore((s) => s.id);
  const sessionStart = useSessionStore((s) => s.start);
  const sessionEnd = useSessionStore((s) => s.end);
  const sessionTick = useSessionStore((s) => s.tick);
  const sessionStartTime = useSessionStore((s) => s.startTime);
  const closingRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen("app://close-requested", () => {
      if (closingRef.current) return;
      closingRef.current = true;

      void (async () => {
        try {
          await useSessionStore.getState().end();
          await invoke("close_app");
        } catch (error) {
          closingRef.current = false;
          console.error("Failed to close app cleanly", error);
        }
      })();
    }).then((stopListening) => {
      if (disposed) stopListening();
      else unlisten = stopListening;
    }).catch((error: unknown) => {
      console.error("Failed to register app close handler", error);
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const inputDevice = useAudioStore((s) => s.inputDevice);
  const inputChannel = useAudioStore((s) => s.inputChannel);
  const audioStatus = useAudioStore((s) => s.status);
  const audioError = useAudioStore((s) => s.lastError);
  const availableDevices = useAudioStore((s) => s.availableDevices);
  const vadSensitivity = useAudioStore((s) => s.vadSensitivity);
  const setAudioDevice = useAudioStore((s) => s.setDevice);
  const setAudioChannel = useAudioStore((s) => s.setChannel);
  const setAudioSensitivity = useAudioStore((s) => s.setVadSensitivity);
  useThemeAttribute(theme);

  useEffect(() => {
    void useConfigStore.getState().hydrateProviderKeys();
  }, []);

  const selectCaptureDevice = useAudioPipeline(authenticatedBranch, inputDevice, sessionStatus);

  useSessionTicker(sessionStartTime, sessionStatus, sessionTick);

  const dbTables = useMemo<DbTable[]>(() => {
    return [
      {
        name: "transcripts",
        description: "Recent transcript feed items",
        columns: ["id", "timestamp", "speaker", "text", "matches"],
        rows: transcripts.map((entry) => ({
          id: entry.id,
          timestamp: entry.timestamp,
          speaker: entry.speaker,
          text: entry.text,
          matches: entry.matches.join(", "),
        })),
      },
      {
        name: "suggestions",
        description: "Scripture cards currently in the queue",
        columns: ["id", "reference", "status", "confidence", "pipelineStage"],
        rows: cards.map((card) => ({
          id: card.id,
          reference: formatReference(card),
          status: card.status,
          confidence: Math.round(card.confidence * 100),
          pipelineStage: card.pipelineStage,
        })),
      },
      {
        name: "projector",
        description: "Current preview and live output state",
        columns: ["channel", "reference", "overlayMode", "theme"],
        rows: [
          {
            channel: "preview",
            reference: previewSlide ? formatReference(previewSlide) : "none",
            overlayMode,
            theme: projectorTheme,
          },
          {
            channel: "live",
            reference: liveSlide ? formatReference(liveSlide) : "none",
            overlayMode,
            theme: projectorTheme,
          },
        ],
      },
    ];
  }, [cards, liveSlide, overlayMode, previewSlide, projectorTheme, transcripts]);

  const previewReference = previewSlide ? formatReference(previewSlide) : null;
  const liveReference = liveSlide ? formatReference(liveSlide) : null;

  const addManualTranscript = (text: string) => {
    const normalized = text.toLowerCase();
    const matches = passageLibrary
      .filter((passage) => `${formatReference(passage)} ${passage.searchText}`.toLowerCase().includes(normalized))
      .map((passage) => formatReference(passage));

    addManualTimelineItem(text, matches);

    if (matches.length === 0) {
      return;
    }

    const newCards = passageLibrary
      .filter((passage) => matches.includes(formatReference(passage)))
      .map<SuggestionCard>((passage, index) => ({
        id: `c-${Date.now()}-${index}`,
        reference: passage.reference,
        text: passage.text,
        confidence: 0.82,
        pipelineStage: 2,
        status: "pending",
        version: passage.version,
        themes: passage.themes,
        createdAt: Date.now(),
        pinned: false,
      }));

    addCards(newCards);
    setPreviewSlide(toSlide(newCards[0]));
    setWorkspaceTab("suggestions");
  };

  const sendLiveCard = (card: SuggestionCard) => {
    const slide = toSlide(card);
    sendLiveSlide(slide);
    updateCardStatus(card.id, "sent");
  };

  const sendEditedCardLive = (card: SuggestionCard, slide: ProjectorSlide) => {
    sendLiveSlide(slide);
    updateCardStatus(card.id, "edited");
  };

  const handleFeedOverrideChange = useCallback((mode: typeof feedOverride) => {
    setFeedOverride(mode);
  }, [setFeedOverride]);

  const toggleFeedOverride = useCallback((mode: Exclude<typeof feedOverride, "live">) => {
    setFeedOverride(feedOverride === mode ? "live" : mode);
  }, [feedOverride, setFeedOverride]);

  const cycleLive = useCallback((direction: -1 | 1) => {
    if (!libraryNavigationRef.current) return;
    setPreviewSlide(null);
    libraryNavigationRef.current(direction);
  }, [setPreviewSlide]);

  useShortcutHandlers({ cycleLive, handleFeedOverrideChange, isSettingsOpen, previewSlide, sendLiveSlide, setOverlayMode, setLibraryTab, setIsSettingsOpen, shortcuts, toggleFeedOverride });

  const {
    librarySchedule,
    addLibraryScheduleItem,
    removeLibraryScheduleItem,
    reorderLibrarySchedule,
    addCueToSchedule,
    openCueFromSchedule,
    previewScheduledItem,
    sendScheduledItemLive,
  } = useLibrarySchedule({
    libraryTab,
    librarySearchQuery,
    librarySearchMode,
    setLibrarySearchQuery,
    selectedScripture,
    selectedLibrarySong,
    setActiveCue,
    setPreviewSlide,
    sendLiveSlide,
  });


  const centerPanel = (() => {
    let panel = (
      <Suspense fallback={<LazyPanelFallback />}>
        <SuggestionDeckPanel
          cards={cards}
          previewReference={previewReference}
          onPreview={(card) => setPreviewSlide(toSlide(card))}
          onSendLive={sendLiveCard}
          onSendEditedLive={sendEditedCardLive}
          onTogglePin={(card) => togglePinnedSuggestion(card.id)}
          onDismiss={dismissSuggestion}
          onClearAll={clearSuggestions}
        />
      </Suspense>
    );

    if (workspaceTab === "bible") {
      panel = (
        <Suspense fallback={<LazyPanelFallback />}>
          <BiblePanel passages={passageLibrary} activeReference={previewReference} onPreviewSlide={setPreviewSlide} />
        </Suspense>
      );
    }

    if (workspaceTab === "notes") {
      panel = (
        <Suspense fallback={<LazyPanelFallback />}>
          <AiPanel items={transcripts} pendingCount={cards.filter((card) => card.status === "pending").length} />
        </Suspense>
      );
    }

    if (workspaceTab === "database") {
      panel = (
        <Suspense fallback={<LazyPanelFallback />}>
          <DbInspectorPanel tables={dbTables} />
        </Suspense>
      );
    }

    return <div style={{ height: "100%", minHeight: 0 }}>{panel}</div>;
  })();

  const headerProps = {
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

  const inputName = inputDevice?.name ?? "Select input device";
  const inputDevices = availableDevices.map((device) => device.name);
  const vadPercent = Math.round(vadSensitivity * 100);

  const { handleAudioDeviceChange, handleAudioChannelChange } = useAudioDeviceHandlers({ inputDevice, setAudioDevice, setAudioChannel, selectCaptureDevice });

  const MODEL_PROVIDER_LABELS: Record<string, string> = {
    groq: "Groq",
    openai: "OpenAI",
    anthropic: "Anthropic",
    gemini: "Gemini",
  };
  const defaultModelProviderKeyed =
    defaultModelProvider === "groq"
      ? Boolean(groqApiKey && groqEnabled)
      : defaultModelProvider
        ? Boolean(modelProviderKeys[defaultModelProvider])
        : false;
  const activeModelProvider =
    defaultModelProvider && defaultModelProviderKeyed
      ? { id: defaultModelProvider, label: MODEL_PROVIDER_LABELS[defaultModelProvider] }
      : null;

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
        }}
        leftPanel={
          <TranscriptTimelinePanel
            items={transcripts}
            onAddManualTranscript={addManualTranscript}
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
              previewMedia={previewMedia}
              liveMedia={liveMedia}
              activeTab={libraryTab}
              searchQuery={librarySearchQuery}
              searchMode={librarySearchMode}
              onActiveTabChange={setLibraryTab}
              onPreviewSlide={setPreviewSlide}
              onSendLive={sendLiveSlide}
              onPreviewMedia={setPreviewMedia}
              onSendMedia={sendLiveMedia}
              onSelectedScriptureChange={setSelectedScripture}
              onSelectedSongChange={setSelectedLibrarySong}
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
            selectedSong={selectedLibrarySong}
            onSearchQueryChange={(value) => { setSelectedScripture(null); setLibrarySearchQuery(value); }}
            searchMode={librarySearchMode}
            onSearchModeChange={setLibrarySearchMode}
            scheduledItems={librarySchedule}
            selectedScripture={selectedScripture}
            onAddToSchedule={addLibraryScheduleItem}
            onRemoveFromSchedule={removeLibraryScheduleItem}
            onReorderSchedule={reorderLibrarySchedule}
            onSchedulePreview={previewScheduledItem}
            onScheduleLive={sendScheduledItemLive}
            onOpenCue={openCueFromSchedule}
          />
        }
      />
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

export default App;
