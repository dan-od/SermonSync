import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";

import { AuthGate } from "./components/Auth/AuthGate";
import type { BranchAccount } from "./components/Auth/types";
import { SettingsPanel } from "./components/Settings/SettingsPanel";
import { TranscriptTimelinePanel } from "./components/TranscriptTimelinePanel";
import type { BiblePassage, DbTable, TranscriptItem } from "./components/desktop/uiTypes";
import { AppLayout } from "./components/layout/AppLayout";
import type { LibraryTab, ScriptureSearchMode } from "./components/LocalLibraryPanel";
import { getAudioDevices, getSidecarStatus, lookupScriptureVerse, selectAudioDevice, setVadSensitivity, startAudioCapture, stopAudioCapture } from "./lib/sidecarClient";
import { knownScriptureBooks, matchScriptureReferenceIncremental, resolveScriptureSearch } from "./lib/scriptureSearch";
import { startSidecarWsBridge } from "./lib/sidecarWs";
import {
  useAudioStore,
  useConfigStore,
  useProjectorStore,
  useSessionStore,
  useSuggestionStore,
  useTranscriptionStore,
} from "./stores";
import type { ProjectorSlide, SuggestionCard } from "./types/state";

const AiPanel = lazy(() => import("./components/AiPanel").then((module) => ({ default: module.AiPanel })));
const BiblePanel = lazy(() => import("./components/BiblePanel").then((module) => ({ default: module.BiblePanel })));
const DbInspectorPanel = lazy(() => import("./components/DbInspectorPanel").then((module) => ({ default: module.DbInspectorPanel })));
const LocalLibraryPanel = lazy(() => import("./components/LocalLibraryPanel").then((module) => ({ default: module.LocalLibraryPanel })));
const ProjectorDeskPanel = lazy(() => import("./components/ProjectorDeskPanel").then((module) => ({ default: module.ProjectorDeskPanel })));
const SuggestionDeckPanel = lazy(() =>
  import("./components/SuggestionDeckPanel").then((module) => ({ default: module.SuggestionDeckPanel })),
);

const shellReset = `
  html, body, #root {
    height: 100%;
    margin: 0;
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
    version: "KJV",
    searchText: "love salvation eternal life gospel invitation",
    themes: ["SALVATION", "GOSPEL"],
  },
  {
    reference: { book: "Acts", chapter: 1, verse: 8 },
    text: "But ye shall receive power, after that the Holy Ghost is come upon you: and ye shall be witnesses unto me.",
    version: "KJV",
    searchText: "power witness holy spirit mission fire",
    themes: ["HOLY SPIRIT", "MISSION"],
  },
  {
    reference: { book: "Isaiah", chapter: 53, verse: 5 },
    text: "But he was wounded for our transgressions, he was bruised for our iniquities: with his stripes we are healed.",
    version: "KJV",
    searchText: "healing stripes restoration covenant",
    themes: ["HEALING", "COVENANT"],
  },
  {
    reference: { book: "Romans", chapter: 10, verse: 9 },
    text: "That if thou shalt confess with thy mouth the Lord Jesus, and shalt believe in thine heart that God hath raised him from the dead, thou shalt be saved.",
    version: "KJV",
    searchText: "confession salvation faith response altar call",
    themes: ["RESPONSE", "SALVATION"],
  },
  {
    reference: { book: "Psalm", chapter: 121, verse: 1 },
    text: "I will lift up mine eyes unto the hills, from whence cometh my help.",
    version: "KJV",
    searchText: "help confidence assurance worship",
    themes: ["HELP", "ASSURANCE"],
  },
  {
    reference: { book: "Philippians", chapter: 4, verse: 6 },
    text: "Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God.",
    version: "KJV",
    searchText: "prayer thanksgiving anxiety peace petition",
    themes: ["PRAYER", "PEACE"],
  },
];

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
}: {
  activeTab: LibraryTab;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  searchMode: ScriptureSearchMode;
  onSearchModeChange: (mode: ScriptureSearchMode) => void;
  scheduledItems: { id: string; kind: "scriptures" | "songs"; value: string }[];
  onAddToSchedule: () => void;
  onRemoveFromSchedule: (id: string) => void;
  onSchedulePreview: (item: { id: string; kind: "scriptures" | "songs"; value: string }) => void;
  onScheduleLive: (item: { id: string; kind: "scriptures" | "songs"; value: string }) => void;
}) {
  const canSearch = activeTab === "scriptures" || activeTab === "songs";
  const label = activeTab === "songs" ? "Search songs" : "Search scriptures";
  const canAdd = canSearch && searchQuery.trim().length > 0;
  const clickTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current !== null) {
        window.clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  const handleItemClick = (item: { id: string; kind: "scriptures" | "songs"; value: string }) => {
    if (clickTimeoutRef.current !== null) {
      window.clearTimeout(clickTimeoutRef.current);
    }

    clickTimeoutRef.current = window.setTimeout(() => {
      onSchedulePreview(item);
      clickTimeoutRef.current = null;
    }, 220);
  };

  const handleItemDoubleClick = (item: { id: string; kind: "scriptures" | "songs"; value: string }) => {
    if (clickTimeoutRef.current !== null) {
      window.clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
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
              gridTemplateColumns: activeTab === "scriptures" ? "minmax(0, 1fr) auto 34px" : "minmax(0, 1fr) 34px",
              alignItems: "center",
              background: "linear-gradient(180deg, rgba(74, 74, 74, 0.8), rgba(51, 51, 51, 0.95))",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "4px",
              boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.04)",
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
                color: canSearch ? "#e5e5e5" : "var(--fg-subtle)",
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
                        background: isActive ? "var(--color-primary)" : "rgba(255, 255, 255, 0.08)",
                        border: "1px solid rgba(255, 255, 255, 0.04)",
                        borderRadius: "3px",
                        marginLeft: 4,
                        cursor: "pointer",
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px",
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                        color: isActive ? "white" : "#dfe0e2",
                      }}
                    >
                      {mode === "words" ? "WORDS" : "REF"}
                    </button>
                  );
                })}
              </div>
            )}
            <span
              aria-hidden="true"
              style={{
                width: 24,
                height: 24,
                marginRight: 5,
                display: "grid",
                placeItems: "center",
                justifySelf: "end",
                borderRadius: "3px",
                background: "rgba(255, 255, 255, 0.08)",
                color: canSearch ? "#dfe0e2" : "var(--fg-subtle)",
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
                border: "1px solid rgba(255, 255, 255, 0.04)",
              }}
            >
              ⌕
            </span>
          </label>
          <button
            type="button"
            onClick={onAddToSchedule}
            disabled={!canAdd}
            style={{
              width: 34,
              height: 34,
              display: "grid",
              placeItems: "center",
              borderRadius: "4px",
              background: "linear-gradient(180deg, rgba(74, 74, 74, 0.8), rgba(51, 51, 51, 0.95))",
              color: canAdd ? "#e5e5e5" : "var(--fg-subtle)",
              fontFamily: "var(--font-mono)",
              fontSize: "18px",
              lineHeight: 1,
              border: "1px solid rgba(255, 255, 255, 0.08)",
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
                onClick={() => handleItemClick(item)}
                onDoubleClick={() => handleItemDoubleClick(item)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto minmax(0, 1fr) auto",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 10px",
                  cursor: "pointer",
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
                  {item.kind === "scriptures" ? "Scripture" : "Song"}
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

const initialTranscripts: TranscriptItem[] = [
  {
    id: "t-001",
    timestamp: "09:42:11",
    speaker: "Resident Minister",
    text: "Church, if we believe John 3:16 again with conviction, the whole room returns to the heart of salvation.",
    matches: ["John 3:16"],
  },
  {
    id: "t-002",
    timestamp: "09:43:03",
    speaker: "Resident Minister",
    text: "We are not waiting for power to arrive later; Acts 1:8 says the Spirit has already equipped the witness.",
    matches: ["Acts 1:8"],
  },
  {
    id: "t-003",
    timestamp: "09:44:27",
    speaker: "Resident Minister",
    text: "Bring every burden to the Lord in prayer and refuse to be governed by anxiety.",
    matches: ["Philippians 4:6"],
  },
  {
    id: "t-004",
    timestamp: "09:45:54",
    speaker: "Resident Minister",
    text: "Healing is not theory for the believer. Isaiah 53:5 anchors our confession in the finished work of Christ.",
    matches: ["Isaiah 53:5"],
  },
  {
    id: "t-005",
    timestamp: "09:47:02",
    speaker: "Resident Minister",
    text: "Romans 8:28 reminds us that every season, even the hard ones, is being worked together for our good.",
    matches: ["Romans 8:28"],
  },
  {
    id: "t-006",
    timestamp: "09:48:19",
    speaker: "Resident Minister",
    text: "We walk by faith and not by sight, standing firmly on the promise of 2 Corinthians 5:7.",
    matches: ["2 Corinthians 5:7"],
  },
  {
    id: "t-007",
    timestamp: "09:49:41",
    speaker: "Resident Minister",
    text: "Ephesians 2:8 settles it plainly: we are saved by grace through faith, and that not of ourselves.",
    matches: ["Ephesians 2:8"],
  },
  {
    id: "t-008",
    timestamp: "09:50:58",
    speaker: "Resident Minister",
    text: "Joshua 1:9 charges us to be strong and courageous, for the Lord goes with us wherever we go.",
    matches: ["Joshua 1:9"],
  },
  {
    id: "t-009",
    timestamp: "09:52:12",
    speaker: "Resident Minister",
    text: "Proverbs 3:5 calls us to trust in the Lord with all our heart rather than lean on our own understanding.",
    matches: ["Proverbs 3:5"],
  },
  {
    id: "t-010",
    timestamp: "09:53:30",
    speaker: "Resident Minister",
    text: "Matthew 11:28 invites every weary soul to come to Christ and find true rest.",
    matches: ["Matthew 11:28"],
  },
];

const initialCards: SuggestionCard[] = ([
  {
    id: "c-001",
    reference: { book: "John", chapter: 3, verse: 16 },
    text: passageLibrary[0].text,
    confidence: 0.97,
    pipelineStage: 4,
    status: "pending",
    version: "KJV",
    themes: ["SALVATION", "GOSPEL"],
  },
  {
    id: "c-002",
    reference: { book: "Acts", chapter: 1, verse: 8 },
    text: passageLibrary[1].text,
    confidence: 0.91,
    pipelineStage: 3,
    status: "pending",
    version: "KJV",
    themes: ["HOLY SPIRIT", "MISSION"],
  },
  {
    id: "c-003",
    reference: { book: "Isaiah", chapter: 53, verse: 5 },
    text: passageLibrary[2].text,
    confidence: 0.88,
    pipelineStage: 2,
    status: "pending",
    version: "KJV",
    themes: ["HEALING", "COVENANT"],
  },
] satisfies SuggestionCard[]).slice(0, 3);

function formatReference(slide: { reference: ProjectorSlide["reference"] }) {
  const { reference } = slide;
  return `${reference.book} ${reference.chapter}:${reference.verse}`;
}

function toSlide(card: SuggestionCard | BiblePassage): ProjectorSlide {
  return {
    reference: card.reference,
    text: card.text,
    version: card.version,
  };
}

function App() {
  const [workspaceTab, setWorkspaceTab] = useState<"suggestions" | "bible" | "notes" | "database">("suggestions");
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("scriptures");
  const [librarySearchQuery, setLibrarySearchQuery] = useState("");
  const [librarySearchMode, setLibrarySearchMode] = useState<ScriptureSearchMode>("words");
  const [librarySchedule, setLibrarySchedule] = useState<{ id: string; kind: "scriptures" | "songs"; value: string }[]>([
    { id: "mock-scripture-1", kind: "scriptures", value: "John 3:16" },
    { id: "mock-song-1", kind: "songs", value: "How Great Thou Art" },
    { id: "mock-scripture-2", kind: "scriptures", value: "Romans 8:28" },
  ]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [authenticatedBranch, setAuthenticatedBranch] = useState<BranchAccount | null>(null);
  const hasInitializedSessionRef = useRef(false);

  const theme = useConfigStore((s) => s.theme);
  const setTheme = useConfigStore((s) => s.setTheme);
  const setUnit = useConfigStore((s) => s.setUnit);
  const groqApiKey = useConfigStore((s) => s.groqApiKey);
  const groqEnabled = useConfigStore((s) => s.groqEnabled);
  const modelProviderKeys = useConfigStore((s) => s.modelProviderKeys);
  const defaultModelProvider = useConfigStore((s) => s.defaultModelProvider);

  const transcripts = useTranscriptionStore((s) => s.timeline);
  const seedTimeline = useTranscriptionStore((s) => s.seedTimeline);
  const addManualTimelineItem = useTranscriptionStore((s) => s.addManualTimelineItem);

  const cards = useSuggestionStore((s) => s.cards);
  const setCards = useSuggestionStore((s) => s.setCards);
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
  const clearScreen = useProjectorStore((s) => s.clearScreen);
  const setOverlayMode = useProjectorStore((s) => s.setOverlayMode);
  const setFeedOverride = useProjectorStore((s) => s.setFeedOverride);

  const sessionStatus = useSessionStore((s) => s.status);
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
  const levelRms = useAudioStore((s) => s.levelRms);
  const levelPeak = useAudioStore((s) => s.levelPeak);
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
      hasInitializedSessionRef.current = false;
      return;
    }

    if (hasInitializedSessionRef.current) {
      return;
    }
    hasInitializedSessionRef.current = true;

    if (transcripts.length === 0) {
      seedTimeline(initialTranscripts);
    }
    if (cards.length === 0) {
      setCards(initialCards);
      setPreviewSlide(toSlide(initialCards[0]));
    }
  }, [authenticatedBranch, cards.length, seedTimeline, setCards, setPreviewSlide, transcripts.length]);

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
            const capture = await startAudioCapture();
            if (cancelled) return;
            useAudioStore.getState().setCapturing(capture.capturing);
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

  const activeReferences = useMemo(() => cards.filter((card) => card.status !== "dismissed"), [cards]);

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

  const handleFeedOverrideChange = (mode: typeof feedOverride) => {
    if (mode === "clear") {
      clearScreen();
    }
    setFeedOverride(mode);
  };

  const cycleLive = (direction: -1 | 1) => {
    if (activeReferences.length === 0) {
      return;
    }

    const currentIndex = activeReferences.findIndex((entry) => formatReference(entry) === liveReference);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + direction + activeReferences.length) % activeReferences.length;
    const nextCard = activeReferences[nextIndex];
    sendLiveSlide(toSlide(nextCard));
  };

  const addLibraryScheduleItem = () => {
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

  const toScheduledSlide = async (item: { id: string; kind: "scriptures" | "songs"; value: string }): Promise<ProjectorSlide> => {
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
        const version = useConfigStore.getState().bibleVersion;
        const looked = await lookupScriptureVerse(book.trim(), chapter, verse, version);
        return {
          reference: { book: book.trim(), chapter, verse },
          text: looked?.text ?? item.value,
          version: looked?.version ?? "KJV",
        };
      }
    }

    return {
      reference: {
        book: item.kind === "songs" ? "Song" : "Scheduled",
        chapter: 1,
        verse: 1,
      },
      text: item.value,
      version: item.kind === "songs" ? "SONG" : "KJV",
    };
  };

  const previewScheduledItem = (item: { id: string; kind: "scriptures" | "songs"; value: string }) => {
    void toScheduledSlide(item).then(setPreviewSlide);
  };

  const sendScheduledItemLive = (item: { id: string; kind: "scriptures" | "songs"; value: string }) => {
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
        const capture = await startAudioCapture();
        useAudioStore.getState().setCapturing(capture.capturing);
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
        const capture = await startAudioCapture();
        useAudioStore.getState().setCapturing(capture.capturing);
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
          engineVersion: "v0.1.0-native",
          locationLabel: "Foursquare Nigeria © 2026",
          latencyMs: sessionLatencyMs,
          uptimeSeconds: sessionUptimeSeconds,
          levelRms,
          levelPeak,
          isSpeech,
          modelProvider: activeModelProvider,
        }}
        leftPanel={<TranscriptTimelinePanel items={transcripts} onAddManualTranscript={addManualTranscript} />}
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
        onVadSensitivityChange={(value) => {
          setAudioSensitivity(value);
          void setVadSensitivity(value).catch((error: unknown) => {
            useAudioStore.getState().setAudioError(error instanceof Error ? error.message : "Could not update speech detector sensitivity.");
          });
        }}
      />
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
