import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AuthGate } from "./components/Auth/AuthGate";
import type { BranchAccount } from "./components/Auth/types";
import { LaunchScreen } from "./components/Launch/LaunchScreen";
import { SettingsPanel } from "./components/Settings/SettingsPanel";
import { CueProjectionModal } from "./components/Songs/CueProjectionModal";
import { TranscriptTimelinePanel } from "./components/TranscriptTimelinePanel";
import type { BiblePassage, DbTable } from "./components/desktop/uiTypes";
import { AppLayout } from "./components/layout/AppLayout";
import type { LibraryNavigationHandler, LibraryTab, ScriptureSearchMode } from "./components/LocalLibraryPanel";
import { getAudioDevices, getSidecarHttpBase, getSidecarStatus, lookupScriptureVerse, selectAudioDevice, setVadSensitivity, startAudioCapture, stopAudioCapture } from "./lib/sidecarClient";
import { knownScriptureBooks, matchScriptureReferenceIncremental, resolveScriptureSearch } from "./lib/scriptureSearch";
import { startSidecarWsBridge } from "./lib/sidecarWs";
import {
  useAudioStore,
  useConfigStore,
  useProjectorStore,
  useSessionStore,
  useSuggestionStore,
  useTemplateStore,
  useTranscriptionStore,
} from "./stores";
import { SHORTCUT_DEFINITIONS, isShortcutEvent, useShortcutStore } from "./stores/shortcutStore";
import type { ProjectorSlide, SuggestionCard } from "./types/state";

const AiPanel = lazy(() => import("./components/AiPanel").then((module) => ({ default: module.AiPanel })));
const BiblePanel = lazy(() => import("./components/BiblePanel").then((module) => ({ default: module.BiblePanel })));
const DbInspectorPanel = lazy(() => import("./components/DbInspectorPanel").then((module) => ({ default: module.DbInspectorPanel })));
const LocalLibraryPanel = lazy(() => import("./components/LocalLibraryPanel").then((module) => ({ default: module.LocalLibraryPanel })));
const ProjectorDeskPanel = lazy(() => import("./components/ProjectorDeskPanel").then((module) => ({ default: module.ProjectorDeskPanel })));
const SuggestionDeckPanel = lazy(() =>
  import("./components/SuggestionDeckPanel").then((module) => ({ default: module.SuggestionDeckPanel })),
);
const SessionSummaryPanel = lazy(() =>
  import("./components/SessionSummaryPanel").then((module) => ({ default: module.SessionSummaryPanel })),
);

const shellReset = `
  html, body, #root {
    height: 100%;
    margin: 0;
    background: var(--bg-base);
  }

  body {
    background: var(--bg-base);
    color: var(--fg-base);
    font-family: var(--font-sans);
    -webkit-user-select: none;
    user-select: none;
  }

  #root {
    width: 100%;
    -webkit-user-select: none;
    user-select: none;
  }

  button, input, select, textarea {
    font: inherit;
  }

  input, textarea, [contenteditable="true"] {
    -webkit-user-select: text;
    user-select: text;
  }
`;

const passageLibrary: BiblePassage[] = [
  {
    reference: { book: "John", chapter: 3, verse: 16 },
    text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
    version: "ENGLISHNKJ",
    searchText: "love salvation eternal life gospel invitation",
    themes: ["SALVATION", "GOSPEL"],
  },
  {
    reference: { book: "Acts", chapter: 1, verse: 8 },
    text: "But ye shall receive power, after that the Holy Ghost is come upon you: and ye shall be witnesses unto me.",
    version: "ENGLISHNKJ",
    searchText: "power witness holy spirit mission fire",
    themes: ["HOLY SPIRIT", "MISSION"],
  },
  {
    reference: { book: "Isaiah", chapter: 53, verse: 5 },
    text: "But he was wounded for our transgressions, he was bruised for our iniquities: with his stripes we are healed.",
    version: "ENGLISHNKJ",
    searchText: "healing stripes restoration covenant",
    themes: ["HEALING", "COVENANT"],
  },
  {
    reference: { book: "Romans", chapter: 10, verse: 9 },
    text: "That if thou shalt confess with thy mouth the Lord Jesus, and shalt believe in thine heart that God hath raised him from the dead, thou shalt be saved.",
    version: "ENGLISHNKJ",
    searchText: "confession salvation faith response altar call",
    themes: ["RESPONSE", "SALVATION"],
  },
  {
    reference: { book: "Psalm", chapter: 121, verse: 1 },
    text: "I will lift up mine eyes unto the hills, from whence cometh my help.",
    version: "ENGLISHNKJ",
    searchText: "help confidence assurance worship",
    themes: ["HELP", "ASSURANCE"],
  },
  {
    reference: { book: "Philippians", chapter: 4, verse: 6 },
    text: "Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God.",
    version: "ENGLISHNKJ",
    searchText: "prayer thanksgiving anxiety peace petition",
    themes: ["PRAYER", "PEACE"],
  },
];

type LibraryScheduleItem = {
  id: string;
  kind: "scriptures" | "songs";
  value: string;
  /** present when this record represents a whole cued song sequence rather than a single slide */
  cueSlides?: { label: string; text: string }[];
};

function LocalLibrarySearch({
  activeTab,
  searchQuery,
  onSearchQueryChange,
  searchMode,
  onSearchModeChange,
  scheduledItems,
  onAddToSchedule,
  onRemoveFromSchedule,
  onSchedulePreview,
  onScheduleLive,
  onOpenCue,
}: {
  activeTab: LibraryTab;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  searchMode: ScriptureSearchMode;
  onSearchModeChange: (mode: ScriptureSearchMode) => void;
  scheduledItems: LibraryScheduleItem[];
  onAddToSchedule: () => void;
  onRemoveFromSchedule: (id: string) => void;
  onSchedulePreview: (item: LibraryScheduleItem) => void;
  onScheduleLive: (item: LibraryScheduleItem) => void;
  onOpenCue: (item: LibraryScheduleItem) => void;
}) {
  const canSearch = activeTab === "scriptures" || activeTab === "songs";
  const label = activeTab === "songs" ? "Search songs" : "Search scriptures";
  const canAdd = canSearch && searchQuery.trim().length > 0;
  const clickTimeoutRef = useRef<number | null>(null);
  const [hoveredScheduleId, setHoveredScheduleId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current !== null) {
        window.clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  const handleItemClick = (item: LibraryScheduleItem) => {
    if (item.cueSlides) return;
    if (clickTimeoutRef.current !== null) {
      window.clearTimeout(clickTimeoutRef.current);
    }

    clickTimeoutRef.current = window.setTimeout(() => {
      onSchedulePreview(item);
      clickTimeoutRef.current = null;
    }, 220);
  };

  const handleItemActivate = (item: LibraryScheduleItem) => {
    if (clickTimeoutRef.current !== null) {
      window.clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }

    if (item.cueSlides) {
      onOpenCue(item);
      return;
    }

    onScheduleLive(item);
  };

  return (
    <div
      style={{
        height: "100%",
        padding: "14px 16px 12px",
        boxSizing: "border-box",
        background: "var(--bg-base)",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "grid",
          gridTemplateRows: "auto auto minmax(0, 1fr)",
          gap: "10px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <label
            style={{
              display: "grid",
              gridTemplateColumns: activeTab === "scriptures" ? "minmax(0, 1fr) auto" : "minmax(0, 1fr)",
              alignItems: "center",
              background: "var(--bg-elevated)",
              border: "none",
              borderRadius: "4px",
              overflow: "hidden",
            }}
          >
            <input
              type="search"
              value={searchQuery}
              disabled={!canSearch}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") {
                  return;
                }

                if (activeTab !== "scriptures") {
                  return;
                }

                let scheduledValue: string;
                if (searchMode === "reference") {
                  const match = matchScriptureReferenceIncremental(searchQuery, knownScriptureBooks);
                  if (!match.matchedBook || match.chapter == null || match.verse == null) {
                    return;
                  }
                  scheduledValue = `${match.matchedBook} ${match.chapter}:${match.verse}`;
                } else {
                  const resolved = resolveScriptureSearch(searchQuery);
                  if (!resolved) {
                    return;
                  }
                  scheduledValue = resolved.value;
                }

                onSearchQueryChange(scheduledValue);
                onScheduleLive({
                  id: `search-${Date.now()}`,
                  kind: "scriptures",
                  value: scheduledValue,
                });
              }}
              placeholder={canSearch ? `${label}...` : "Search unavailable"}
              aria-label={label}
              style={{
                minWidth: 0,
                height: 34,
                padding: "0 11px",
                border: "none",
                outline: "none",
                background: "transparent",
                color: canSearch ? "var(--fg-base)" : "var(--fg-subtle)",
                fontSize: "var(--text-xs)",
              }}
            />
            {activeTab === "scriptures" && (
              <div role="radiogroup" aria-label="Scripture search mode" style={{ display: "flex", marginRight: 5 }}>
                {(["words", "reference"] as const).map((mode) => {
                  const isActive = searchMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      onClick={() => onSearchModeChange(mode)}
                      title={mode === "words" ? "Search verse text" : "Search by book, chapter & verse"}
                      style={{
                        height: 24,
                        padding: "0 8px",
                        background: isActive ? "var(--color-primary)" : "var(--bg-surface)",
                        border: "none",
                        borderRadius: "3px",
                        marginLeft: 4,
                        cursor: "pointer",
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px",
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                        color: isActive ? "var(--fg-on-accent)" : "var(--fg-muted)",
                      }}
                    >
                      {mode === "words" ? "WORDS" : "REF"}
                    </button>
                  );
                })}
              </div>
            )}
          </label>
          <button
            type="button"
            onClick={() => onAddToSchedule()}
            disabled={!canAdd}
            style={{
              width: 34,
              height: 34,
              display: "grid",
              placeItems: "center",
              borderRadius: "4px",
              background: "var(--bg-elevated)",
              color: canAdd ? "var(--fg-base)" : "var(--fg-subtle)",
              fontFamily: "var(--font-mono)",
              fontSize: "18px",
              lineHeight: 1,
              border: "none",
              cursor: canAdd ? "pointer" : "not-allowed",
            }}
          >
            +
          </button>
        </div>

        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "8px",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--fg-subtle)",
          }}
        >
          Schedule
        </div>

        <div
          style={{
            minHeight: 0,
            border: "none",
            borderRadius: "4px",
            overflow: "auto",
            background: "var(--bg-elevated)",
          }}
        >
          {scheduledItems.length === 0 ? (
            <div
              style={{
                padding: "10px 12px",
                color: "var(--fg-subtle)",
                fontSize: "var(--text-xs)",
                fontStyle: "italic",
              }}
            >
              No scheduled scriptures or songs yet.
            </div>
          ) : (
            scheduledItems.map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => handleItemClick(item)}
                onDoubleClick={() => handleItemActivate(item)}
                onMouseEnter={() => setHoveredScheduleId(item.id)}
                onMouseLeave={() => setHoveredScheduleId((current) => (current === item.id ? null : current))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleItemActivate(item);
                  }
                }}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto minmax(0, 1fr) auto",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 10px",
                  cursor: "pointer",
                  background: hoveredScheduleId === item.id ? "var(--color-primary-muted)" : "transparent",
                  transition: "background 120ms ease",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "8px",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--fg-subtle)",
                  }}
                >
                  {item.kind === "scriptures" ? "Scripture" : item.cueSlides ? "Cued" : "Song"}
                </span>
                <span
                  style={{
                    minWidth: 0,
                    fontSize: "var(--text-xs)",
                    color: "var(--fg-base)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={item.value}
                >
                  {item.value}
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveFromSchedule(item.id);
                  }}
                  aria-label="Remove scheduled item"
                  style={{
                    width: 22,
                    height: 22,
                    border: "none",
                    borderRadius: "3px",
                    background: "transparent",
                    color: "var(--fg-muted)",
                    cursor: "pointer",
                    fontFamily: "var(--font-mono)",
                    fontSize: "12px",
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function formatReference(slide: { reference: ProjectorSlide["reference"] }) {
  const { reference } = slide;
  return `${reference.book} ${reference.chapter}:${reference.verse}`;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

function toSlide(card: SuggestionCard | BiblePassage): ProjectorSlide {
  const versions = useConfigStore.getState().bibleVersions;
  const matched = versions.find(
    (v) =>
      v.abbreviation.toLowerCase() === card.version.toLowerCase() ||
      v.name.toLowerCase() === card.version.toLowerCase(),
  );
  return {
    reference: card.reference,
    text: card.text,
    version: matched?.name || card.version,
  };
}

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

  const theme = useConfigStore((s) => s.theme);
  const setTheme = useConfigStore((s) => s.setTheme);
  const setUnit = useConfigStore((s) => s.setUnit);
  const groqApiKey = useConfigStore((s) => s.groqApiKey);
  const groqEnabled = useConfigStore((s) => s.groqEnabled);
  const modelProviderKeys = useConfigStore((s) => s.modelProviderKeys);
  const defaultModelProvider = useConfigStore((s) => s.defaultModelProvider);

  const transcripts = useTranscriptionStore((s) => s.timeline);
  // Interim hypotheses arrive while the speaker is still talking; the sidecar
  // bridge clears this on each finalized sentence.
  const interimText = useTranscriptionStore((s) => s.latestPartial);
  const addManualTimelineItem = useTranscriptionStore((s) => s.addManualTimelineItem);

  // SS-065: report the transcription model actually running, never a guess.
  // Polled because the model loads lazily on the first utterance, so the footer
  // must flip from configured to loaded when that happens.
  const [engineVersion, setEngineVersion] = useState("v0.1.0-native");
  const [engineModel, setEngineModel] = useState("");
  const [engineModelDegraded, setEngineModelDegraded] = useState(false);

  useEffect(() => {
    interface EngineStatus {
      version?: string;
      transcription?: {
        configured_model?: string;
        loaded_model?: string | null;
        loaded?: boolean;
        degraded?: boolean | null;
        device?: string;
        compute_type?: string;
      };
    }

    const read = () =>
      fetch(`${getSidecarHttpBase()}/api/engine/status`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: EngineStatus | null) => {
          if (!d) return;
          if (d.version) setEngineVersion(`v${d.version}`);
          const t = d.transcription;
          if (!t) return;
          const model = t.loaded_model ?? t.configured_model ?? "unknown";
          const pending = t.loaded ? "" : " \u22ef";
          setEngineModel(`${model} \u00b7 ${t.device}/${t.compute_type}${pending}`);
          setEngineModelDegraded(Boolean(t.degraded));
        })
        .catch(() => undefined);

    read();
    const timer = setInterval(read, 10000);
    return () => clearInterval(timer);
  }, []);

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
  const isSpeech = useAudioStore((s) => s.isSpeech);
  const sessionLatencyMs = useSessionStore((s) => s.lastLatencyMs);
  const sessionUptimeSeconds = useSessionStore((s) => s.uptimeSeconds);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    void useConfigStore.getState().hydrateProviderKeys();
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

  useEffect(() => {
    if (sessionStatus !== "active" || !sessionStartTime) {
      return;
    }

    const id = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
      sessionTick(elapsed);
    }, 1000);

    return () => window.clearInterval(id);
  }, [sessionStartTime, sessionStatus, sessionTick]);

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

  const cycleLive = useCallback((direction: -1 | 1) => {
    if (!libraryNavigationRef.current) return;
    setPreviewSlide(null);
    libraryNavigationRef.current(direction);
  }, [setPreviewSlide]);

  useEffect(() => {
    if (isSettingsOpen) return;

    const handleShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || isEditableTarget(event.target)) return;
      const definition = SHORTCUT_DEFINITIONS.find((entry) => isShortcutEvent(event, shortcuts[entry.action]));
      if (!definition) return;
      if (definition.action === "template-undo" || definition.action === "template-redo") return;

      event.preventDefault();
      switch (definition.action) {
        case "feed-live":
          handleFeedOverrideChange("live");
          break;
        case "feed-logo":
          handleFeedOverrideChange("logo");
          break;
        case "feed-black":
          handleFeedOverrideChange("black");
          break;
        case "feed-clear":
          handleFeedOverrideChange("clear");
          break;
        case "layout-widescreen":
          setOverlayMode("widescreen");
          break;
        case "layout-lower-third":
          setOverlayMode("lower-third");
          break;
        case "library-previous":
          cycleLive(-1);
          break;
        case "library-next":
          cycleLive(1);
          break;
        case "send-preview-live":
          if (previewSlide) sendLiveSlide(previewSlide);
          break;
        case "open-settings":
          setIsSettingsOpen(true);
          break;
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [cycleLive, handleFeedOverrideChange, isSettingsOpen, previewSlide, sendLiveSlide, setOverlayMode, shortcuts]);

  const addLibraryScheduleItem = (slide?: ProjectorSlide) => {
    if (slide) {
      const kind = slide.version === "Lyrics" || slide.version === "SONG" ? "songs" : "scriptures";
      const value = kind === "scriptures" ? `${slide.reference.book} ${slide.reference.chapter}:${slide.reference.verse}` : slide.text;
      setLibrarySchedule((current) => current.some((item) => item.kind === kind && item.value.toLowerCase() === value.toLowerCase())
        ? current
        : [...current, { id: `${kind}-${Date.now()}-${current.length}`, kind, value }]);
      return;
    }
    const normalized = librarySearchQuery.trim();
    if (!normalized || (libraryTab !== "scriptures" && libraryTab !== "songs")) {
      return;
    }

    let nextValue = normalized;
    let resolved = true;
    if (libraryTab === "scriptures") {
      if (librarySearchMode === "reference") {
        const match = matchScriptureReferenceIncremental(normalized, knownScriptureBooks);
        if (match.matchedBook && match.chapter != null && match.verse != null) {
          nextValue = `${match.matchedBook} ${match.chapter}:${match.verse}`;
        } else {
          resolved = false;
        }
      } else {
        const wordsMatch = resolveScriptureSearch(normalized);
        nextValue = wordsMatch?.value ?? normalized;
        resolved = Boolean(wordsMatch);
      }
    }

    setLibrarySchedule((current) => {
      const duplicate = current.some((item) => item.kind === libraryTab && item.value.toLowerCase() === nextValue.toLowerCase());
      if (duplicate) {
        return current;
      }

      return [
        ...current,
        {
          id: `${libraryTab}-${Date.now()}-${current.length}`,
          kind: libraryTab,
          value: nextValue,
        },
      ];
    });

    if (resolved) {
      setLibrarySearchQuery(nextValue);
    }
  };

  const removeLibraryScheduleItem = (id: string) => {
    setLibrarySchedule((current) => current.filter((item) => item.id !== id));
  };

  const addCueToSchedule = (cue: { title: string; slides: { label: string; text: string }[] }) => {
    const title = cue.title.trim() || "Untitled Song";
    setLibrarySchedule((current) => [
      ...current,
      { id: `songs-cue-${Date.now()}-${current.length}`, kind: "songs", value: title, cueSlides: cue.slides },
    ]);
  };

  const openCueFromSchedule = (item: LibraryScheduleItem) => {
    if (item.cueSlides) setActiveCue(item);
  };

  const toScheduledSlide = async (item: LibraryScheduleItem): Promise<ProjectorSlide> => {
    if (item.kind === "scriptures") {
      const exactPassage = passageLibrary.find((passage) => formatReference(passage).toLowerCase() === item.value.toLowerCase());
      if (exactPassage) {
        return toSlide(exactPassage);
      }

      const referenceMatch = item.value.match(/^(.+)\s+(\d+):(\d+)$/);
      if (referenceMatch) {
        const [, book, chapterText, verseText] = referenceMatch;
        const chapter = Number.parseInt(chapterText, 10);
        const verse = Number.parseInt(verseText, 10);
        const configVersion = useConfigStore.getState().bibleVersion;
        const versions = useConfigStore.getState().bibleVersions;
        const matched = versions.find(
          (v) =>
            v.abbreviation.toLowerCase() === configVersion.toLowerCase() ||
            v.name.toLowerCase() === configVersion.toLowerCase(),
        );
        const lookupVersion = matched?.abbreviation || configVersion;
        const defaultDisplayName = matched?.name || matched?.abbreviation || configVersion;
        const looked = await lookupScriptureVerse(book.trim(), chapter, verse, lookupVersion);
        return {
          reference: { book: book.trim(), chapter, verse },
          text: looked?.text ?? item.value,
          version: looked?.version ?? defaultDisplayName,
        };
      }
    }

    const configVersion = useConfigStore.getState().bibleVersion;
    const versions = useConfigStore.getState().bibleVersions;
    const matched = versions.find(
      (v) =>
        v.abbreviation.toLowerCase() === configVersion.toLowerCase() ||
        v.name.toLowerCase() === configVersion.toLowerCase(),
    );
    const defaultDisplayName = matched?.name || matched?.abbreviation || configVersion;

    return {
      reference: {
        book: item.kind === "songs" ? "Song" : "Scheduled",
        chapter: 1,
        verse: 1,
      },
      text: item.value,
      version: item.kind === "songs" ? "SONG" : defaultDisplayName,
    };
  };

  const previewScheduledItem = (item: LibraryScheduleItem) => {
    void toScheduledSlide(item).then(setPreviewSlide);
  };

  const sendScheduledItemLive = (item: LibraryScheduleItem) => {
    void toScheduledSlide(item).then(sendLiveSlide);
  };

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
          onSync: () => undefined,
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
          latencyMs: sessionLatencyMs,
          uptimeSeconds: sessionUptimeSeconds,
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
                  sessionElapsedSeconds={sessionElapsed}
                  sessionId={sessionId}
                />
              </Suspense>
            </div>
          </div>
        </div>
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

function LazyPanelFallback() {
  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "grid",
        placeItems: "center",
        color: "var(--fg-subtle)",
        fontFamily: "var(--font-mono)",
        fontSize: "12px",
      }}
    >
      Loading panel...
    </div>
  );
}

export default App;
