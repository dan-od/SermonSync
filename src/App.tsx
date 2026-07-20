import { useEffect, useMemo, useState } from "react";

import { AiPanel } from "./components/AiPanel";
import { BiblePanel } from "./components/BiblePanel";
import { DbInspectorPanel } from "./components/DbInspectorPanel";
import { ProjectorDeskPanel } from "./components/ProjectorDeskPanel";
import { SuggestionDeckPanel } from "./components/SuggestionDeckPanel";
import { TranscriptTimelinePanel } from "./components/TranscriptTimelinePanel";
import type { BiblePassage, DbTable, TranscriptItem } from "./components/desktop/uiTypes";
import { AppLayout } from "./components/layout/AppLayout";
import "./styles/tokens.css";
import type { OverlayMode, ProjectorSlide, SessionStatus, SuggestionCard, UiTheme, VerseTheme } from "./types/state";

const shellReset = `
  html, body, #root {
    height: 100%;
    margin: 0;
  }

  body {
    background: var(--bg-base);
    color: var(--fg-base);
    font-family: var(--font-sans);
  }

  #root {
    width: 100%;
  }

  button, input, select, textarea {
    font: inherit;
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
  {
    id: "c-004",
    reference: { book: "Philippians", chapter: 4, verse: 6 },
    text: passageLibrary[5].text,
    confidence: 0.84,
    pipelineStage: 2,
    status: "pending",
    version: "KJV",
    themes: ["PRAYER", "PEACE"],
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
  const [transcripts, setTranscripts] = useState(initialTranscripts);
  const [cards, setCards] = useState(initialCards);
  const [workspaceTab, setWorkspaceTab] = useState<"suggestions" | "bible" | "notes" | "database">("suggestions");
  const [feedOverride, setFeedOverride] = useState<"live" | "logo" | "black" | "clear">("live");
  const [previewSlide, setPreviewSlide] = useState<ProjectorSlide | null>(toSlide(initialCards[0]));
  const [liveSlide, setLiveSlide] = useState<ProjectorSlide | null>(null);
  const [overlayMode, setOverlayMode] = useState<OverlayMode>("widescreen");
  const [theme] = useState<VerseTheme>("cross");
  const [uiTheme, setUiTheme] = useState<UiTheme>("dark");
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("idle");
  const [inputName, setInputName] = useState("Default Device");
  const [vadPercent, setVadPercent] = useState(85);

  useEffect(() => {
    document.documentElement.dataset.theme = uiTheme;
  }, [uiTheme]);

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
            theme,
          },
          {
            channel: "live",
            reference: liveSlide ? formatReference(liveSlide) : "none",
            overlayMode,
            theme,
          },
        ],
      },
    ];
  }, [cards, liveSlide, overlayMode, previewSlide, theme, transcripts]);

  const activeReferences = useMemo(() => cards.filter((card) => card.status !== "dismissed"), [cards]);

  const previewReference = previewSlide ? formatReference(previewSlide) : null;
  const liveReference = liveSlide ? formatReference(liveSlide) : null;

  const addManualTranscript = (text: string) => {
    const normalized = text.toLowerCase();
    const matches = passageLibrary
      .filter((passage) => `${formatReference(passage)} ${passage.searchText}`.toLowerCase().includes(normalized))
      .map((passage) => formatReference(passage));

    const nextItem: TranscriptItem = {
      id: `t-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString("en-GB", { hour12: false }),
      speaker: "Manual Override",
      text,
      matches,
    };

    setTranscripts((items) => [nextItem, ...items].slice(0, 4));

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
      }));

    setCards((current) => [...newCards, ...current].slice(0, 3));
    setPreviewSlide(toSlide(newCards[0]));
    setWorkspaceTab("suggestions");
  };

  const sendLiveCard = (card: SuggestionCard) => {
    const slide = toSlide(card);
    setLiveSlide(slide);
    setCards((current) =>
      current.map((entry) => ({
        ...entry,
        status: entry.id === card.id ? "sent" : entry.status,
      })),
    );
  };

  const cycleLive = (direction: -1 | 1) => {
    if (activeReferences.length === 0) {
      return;
    }

    const currentIndex = activeReferences.findIndex((entry) => formatReference(entry) === liveReference);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + direction + activeReferences.length) % activeReferences.length;
    const nextCard = activeReferences[nextIndex];
    const slide = toSlide(nextCard);
    setLiveSlide(slide);
  };

  const centerPanel = (() => {
    let panel = (
      <SuggestionDeckPanel
        cards={cards}
        previewReference={previewReference}
        liveReference={liveReference}
        onPreview={(card) => setPreviewSlide(toSlide(card))}
        onSendLive={sendLiveCard}
        onClearAll={() => setCards([])}
      />
    );

    if (workspaceTab === "bible") {
      panel = <BiblePanel passages={passageLibrary} activeReference={previewReference} onPreviewSlide={setPreviewSlide} />;
    }

    if (workspaceTab === "notes") {
      panel = <AiPanel items={transcripts} pendingCount={cards.filter((card) => card.status === "pending").length} />;
    }

    if (workspaceTab === "database") {
      panel = <DbInspectorPanel tables={dbTables} />;
    }

    return (
      <div style={{ height: "100%", minHeight: 0 }}>{panel}</div>
    );
  })();

  const headerProps = {
    activeTab: workspaceTab,
    onTabChange: setWorkspaceTab,
    feedOverride,
    onFeedOverrideChange: setFeedOverride,
    uiTheme,
    onUiThemeChange: setUiTheme,
    sessionStatus,
    onSessionStart: () => setSessionStatus("active"),
    onSessionEnd: () => setSessionStatus("ended"),
  } as unknown as Parameters<typeof AppLayout>[0]["header"];

  const projectorDeskProps = {
    previewSlide,
    liveSlide,
    overlayMode,
    onOverlayModeChange: setOverlayMode,
    theme,
    onSendLive: () => setLiveSlide(previewSlide),
    onPrevious: () => cycleLive(-1),
    onNext: () => cycleLive(1),
  };

  return (
    <>
      <style>{shellReset}</style>
      <AppLayout
        header={headerProps}
        status={{
          inputName,
          inputDevices: ["Default Device", "Built-in Microphone", "USB Audio Interface"],
          onInputNameChange: setInputName,
          vadPercent,
          onVadPercentChange: setVadPercent,
          sampleRateLabel: "44.1 kHz PCM",
          engineVersion: "v0.1.0-native",
          locationLabel: "Foursquare Nigeria © 2026",
        }}
        leftPanel={
          <TranscriptTimelinePanel
            items={transcripts}
            onAddManualTranscript={addManualTranscript}
          />
        }
        centerPanel={centerPanel}
        rightPanel={
          <ProjectorDeskPanel {...projectorDeskProps} />
        }
      />
    </>
  );
}

export default App;
