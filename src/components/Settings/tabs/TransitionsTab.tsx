import { useState } from "react";

import { IconBook, IconEyeOff, IconLayout, IconMonitor, IconSparkles, IconTransition } from "../icons";
import { SectionIntro, SelectRow, SettingsCard, SliderRow, ToggleRow } from "../primitives";
import type {
  SettingsPanelState,
  TransitionEasing,
  TransitionEffect,
  TransitionSetting,
} from "../types";

interface TransitionsTabProps {
  panelState: SettingsPanelState;
  onPanelChange: <K extends keyof SettingsPanelState>(key: K, value: SettingsPanelState[K]) => void;
}

type TransitionCategory = "scriptures" | "songs" | "layout" | "logo" | "black" | "clear";

const CATEGORY_LABELS: Record<TransitionCategory, { title: string; subtitle: string; icon: React.ReactNode }> = {
  scriptures: {
    title: "Scripture Slides",
    subtitle: "Transitions when displaying or switching scripture verses",
    icon: <IconBook />,
  },
  songs: {
    title: "Song Lyrics",
    subtitle: "Transitions when advancing through worship song slides",
    icon: <IconSparkles />,
  },
  layout: {
    title: "Screen Layout",
    subtitle: "Transitions when switching between Widescreen Slide and Lower Third",
    icon: <IconLayout />,
  },
  logo: {
    title: "Logo Override",
    subtitle: "Transitions when switching to the church logo background",
    icon: <IconMonitor />,
  },
  black: {
    title: "Black Screen",
    subtitle: "Transitions when activating full black screen override",
    icon: <IconLayout />,
  },
  clear: {
    title: "Clear Screen",
    subtitle: "Transitions when clearing verse text overlays",
    icon: <IconEyeOff />,
  },
};

const EFFECT_OPTIONS: { value: TransitionEffect; label: string }[] = [
  { value: "fade", label: "Fade (Dissolve)" },
  { value: "dissolve", label: "Soft Cross-Dissolve" },
  { value: "slide-left", label: "Slide Left" },
  { value: "slide-right", label: "Slide Right" },
  { value: "slide-up", label: "Slide Up" },
  { value: "slide-down", label: "Slide Down" },
  { value: "push-left", label: "Push Left" },
  { value: "push-right", label: "Push Right" },
  { value: "push-up-crossfade", label: "Push Up (Crossfade)" },
  { value: "wipe-left", label: "Wipe Left" },
  { value: "wipe-right", label: "Wipe Right" },
  { value: "zoom-in", label: "Zoom In" },
  { value: "zoom-out", label: "Zoom Out" },
  { value: "cut", label: "Instant Cut (No Anim)" },
];

const EASING_OPTIONS: { value: TransitionEasing; label: string }[] = [
  { value: "ease-in-out", label: "Ease In-Out (Smooth)" },
  { value: "ease", label: "Ease (Standard)" },
  { value: "ease-out", label: "Ease Out (Decelerate)" },
  { value: "ease-in", label: "Ease In (Accelerate)" },
  { value: "linear", label: "Linear (Uniform Speed)" },
  { value: "spring", label: "Spring (Elastic Bounce)" },
];

export function TransitionsTab({ panelState, onPanelChange }: TransitionsTabProps) {
  const [activeCategory, setActiveCategory] = useState<TransitionCategory>("scriptures");
  const [previewKey, setPreviewKey] = useState(0);

  const transitions = panelState.transitions;

  const updateCategoryTransition = (
    cat: TransitionCategory,
    update: Partial<TransitionSetting>,
  ) => {
    onPanelChange("transitions", {
      ...transitions,
      [cat]: {
        ...transitions[cat],
        ...update,
      },
    });
  };

  const applyPreset = (preset: "cinematic" | "punchy" | "broadcast" | "cut" | "default") => {
    let next: SettingsPanelState["transitions"];
    if (preset === "cinematic") {
      next = {
        scriptures: { effect: "fade", durationMs: 500, easing: "ease-in-out", crossfade: true, motionBlur: false },
        songs: { effect: "dissolve", durationMs: 450, easing: "ease-in-out", crossfade: true, motionBlur: false },
        layout: { effect: "dissolve", durationMs: 500, easing: "ease-in-out", crossfade: true, motionBlur: false },
        logo: { effect: "zoom-in", durationMs: 600, easing: "ease-out", crossfade: true, motionBlur: true },
        black: { effect: "fade", durationMs: 400, easing: "linear", crossfade: true, motionBlur: false },
        clear: { effect: "dissolve", durationMs: 350, easing: "ease-out", crossfade: true, motionBlur: false },
      };
    } else if (preset === "punchy") {
      next = {
        scriptures: { effect: "slide-left", durationMs: 300, easing: "spring", crossfade: true, motionBlur: true },
        songs: { effect: "push-left", durationMs: 280, easing: "spring", crossfade: true, motionBlur: true },
        layout: { effect: "zoom-in", durationMs: 320, easing: "ease-out", crossfade: true, motionBlur: true },
        logo: { effect: "zoom-in", durationMs: 350, easing: "ease-out", crossfade: true, motionBlur: true },
        black: { effect: "slide-down", durationMs: 250, easing: "ease-out", crossfade: false, motionBlur: true },
        clear: { effect: "slide-up", durationMs: 250, easing: "ease-out", crossfade: true, motionBlur: false },
      };
    } else if (preset === "broadcast") {
      next = {
        scriptures: { effect: "wipe-left", durationMs: 400, easing: "ease-out", crossfade: true, motionBlur: false },
        songs: { effect: "wipe-left", durationMs: 350, easing: "ease-out", crossfade: true, motionBlur: false },
        layout: { effect: "fade", durationMs: 400, easing: "ease-in-out", crossfade: true, motionBlur: false },
        logo: { effect: "fade", durationMs: 400, easing: "ease-in-out", crossfade: true, motionBlur: false },
        black: { effect: "cut", durationMs: 0, easing: "linear", crossfade: false, motionBlur: false },
        clear: { effect: "fade", durationMs: 300, easing: "ease-out", crossfade: true, motionBlur: false },
      };
    } else if (preset === "cut") {
      next = {
        scriptures: { effect: "cut", durationMs: 0, easing: "linear", crossfade: false, motionBlur: false },
        songs: { effect: "cut", durationMs: 0, easing: "linear", crossfade: false, motionBlur: false },
        layout: { effect: "cut", durationMs: 0, easing: "linear", crossfade: false, motionBlur: false },
        logo: { effect: "cut", durationMs: 0, easing: "linear", crossfade: false, motionBlur: false },
        black: { effect: "cut", durationMs: 0, easing: "linear", crossfade: false, motionBlur: false },
        clear: { effect: "cut", durationMs: 0, easing: "linear", crossfade: false, motionBlur: false },
      };
    } else {
      next = {
        scriptures: { effect: "fade", durationMs: 350, easing: "ease-in-out", crossfade: true, motionBlur: false },
        songs: { effect: "slide-left", durationMs: 400, easing: "ease", crossfade: true, motionBlur: true },
        layout: { effect: "dissolve", durationMs: 400, easing: "ease-in-out", crossfade: true, motionBlur: false },
        logo: { effect: "zoom-in", durationMs: 500, easing: "ease-out", crossfade: true, motionBlur: true },
        black: { effect: "fade", durationMs: 250, easing: "linear", crossfade: false, motionBlur: false },
        clear: { effect: "dissolve", durationMs: 300, easing: "ease-out", crossfade: true, motionBlur: false },
      };
    }
    onPanelChange("transitions", next);
    setPreviewKey((k) => k + 1);
  };

  const currentConfig = transitions[activeCategory];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <SectionIntro
        title="Screen Transitions & Motion"
        description="Configure independent visual transition styles, speeds, and motion curves for scriptures, song lyrics, logo overrides, black screens, and clear triggers."
      />

      {/* Global Presets */}
      <div
        style={{
          background: "var(--bg-surface)",
          borderRadius: "var(--radius-lg)",
          padding: "14px 16px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--fg-muted)",
            }}
          >
            GLOBAL TRANSITION PRESETS
          </span>
          <span style={{ fontSize: "10px", color: "var(--fg-subtle)" }}>Applies configured profiles to all 6 categories</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {[
            {
              id: "cinematic",
              label: "Cinematic Smooth",
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M2 8h20M6 4l3 4M11 4l3 4M16 4l3 4" />
                </svg>
              ),
            },
            {
              id: "punchy",
              label: "Punchy & Dynamic",
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              ),
            },
            {
              id: "broadcast",
              label: "Classic Broadcast",
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2" y="7" width="20" height="13" rx="2" />
                  <polyline points="17 2 12 7 7 2" />
                </svg>
              ),
            },
            {
              id: "cut",
              label: "Instant Cut",
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="6" cy="6" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <line x1="20" y1="4" x2="8.12" y2="15.88" />
                  <line x1="14.47" y1="14.47" x2="20" y2="20" />
                  <line x1="8.12" y1="8.12" x2="12" y2="12" />
                </svg>
              ),
            },
            {
              id: "default",
              label: "Reset Defaults",
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              ),
            },
          ].map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset.id as Parameters<typeof applyPreset>[0])}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                border: "none",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-elevated)",
                color: "var(--fg-base)",
                padding: "6px 12px",
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-xs)",
                fontWeight: 600,
                cursor: "pointer",
                transition: "background 150ms ease, color 150ms ease",
              }}
            >
              {preset.icon}
              <span>{preset.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Mini Stage Live Transition Simulator */}
      <div
        style={{
          background: "var(--bg-surface)",
          borderRadius: "var(--radius-lg)",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--color-primary)",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <IconTransition style={{ width: 14, height: 14 }} />
            LIVE TRANSITION SIMULATOR
          </span>
          <button
            type="button"
            onClick={() => setPreviewKey((k) => k + 1)}
            style={{
              border: "none",
              borderRadius: "4px",
              background: "var(--color-primary)",
              color: "#fff",
              padding: "4px 10px",
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ▷ PLAY PREVIEW
          </button>
        </div>

        {/* Category selector tabs */}
        <div style={{ display: "flex", gap: "4px", background: "var(--bg-elevated)", padding: "3px", borderRadius: "6px" }}>
          {(["scriptures", "songs", "layout", "logo", "black", "clear"] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => {
                setActiveCategory(cat);
                setPreviewKey((k) => k + 1);
              }}
              style={{
                flex: 1,
                border: "none",
                borderRadius: "4px",
                background: activeCategory === cat ? "var(--color-primary)" : "transparent",
                color: activeCategory === cat ? "#fff" : "var(--fg-muted)",
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                fontWeight: 600,
                padding: "6px 4px",
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                transition: "background 150ms ease, color 150ms ease",
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Stage Frame */}
        <div
          style={{
            height: "180px",
            borderRadius: "var(--radius-md)",
            background: "#080912",
            position: "relative",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid var(--border-base)",
          }}
        >
          <TransitionPreviewStage
            key={`${activeCategory}-${previewKey}`}
            category={activeCategory}
            setting={currentConfig}
          />
        </div>
      </div>

      {/* Individual Category Settings Cards */}
      {(["scriptures", "songs", "layout", "logo", "black", "clear"] as const).map((cat) => {
        const meta = CATEGORY_LABELS[cat];
        const config = transitions[cat];

        return (
          <SettingsCard key={cat} icon={meta.icon} title={meta.title} subtitle={meta.subtitle}>
            <SelectRow
              label="Transition Effect"
              value={config.effect}
              options={EFFECT_OPTIONS}
              onChange={(val) => {
                updateCategoryTransition(cat, { effect: val as TransitionEffect });
                setActiveCategory(cat);
                setPreviewKey((k) => k + 1);
              }}
            />
            <SliderRow
              label="Duration"
              value={config.durationMs}
              min={0}
              max={2000}
              step={25}
              unit="ms"
              onChange={(val) => {
                updateCategoryTransition(cat, { durationMs: val });
                setActiveCategory(cat);
              }}
            />
            <SelectRow
              label="Easing Curve"
              value={config.easing}
              options={EASING_OPTIONS}
              onChange={(val) => {
                updateCategoryTransition(cat, { easing: val as TransitionEasing });
                setActiveCategory(cat);
              }}
            />
            <ToggleRow
              label="Crossfade / Blend"
              description="Smoothly overlap outgoing and incoming visual frames during movement."
              checked={config.crossfade}
              onChange={(checked) => updateCategoryTransition(cat, { crossfade: checked })}
            />
            <ToggleRow
              label="Motion Blur Effect"
              description="Apply dynamic direction blur during rapid slide transitions."
              checked={config.motionBlur}
              onChange={(checked) => updateCategoryTransition(cat, { motionBlur: checked })}
            />
          </SettingsCard>
        );
      })}
    </div>
  );
}

function TransitionPreviewStage({
  category,
  setting,
}: {
  category: TransitionCategory;
  setting: TransitionSetting;
}) {
  const cssEasing =
    setting.easing === "spring"
      ? "cubic-bezier(0.34, 1.56, 0.64, 1)"
      : setting.easing;

  const durationSec = setting.durationMs / 1000;
  const filterBlur = setting.motionBlur ? "blur(3px)" : "none";

  const getAnimation = () => {
    if (setting.effect === "cut" || setting.durationMs === 0) {
      return "none";
    }
    switch (setting.effect) {
      case "fade":
      case "dissolve":
        return `ssFadeIn ${durationSec}s ${cssEasing} forwards`;
      case "slide-left":
      case "push-left":
      case "wipe-left":
        return `ssSlideLeft ${durationSec}s ${cssEasing} forwards`;
      case "slide-right":
      case "push-right":
      case "wipe-right":
        return `ssSlideRight ${durationSec}s ${cssEasing} forwards`;
      case "slide-up":
        return `ssSlideUp ${durationSec}s ${cssEasing} forwards`;
      case "slide-down":
        return `ssSlideDown ${durationSec}s ${cssEasing} forwards`;
      case "push-up-crossfade":
        return `ssPushUpCrossfade ${durationSec}s ${cssEasing} forwards`;
      case "zoom-in":
        return `ssZoomIn ${durationSec}s ${cssEasing} forwards`;
      case "zoom-out":
        return `ssZoomOut ${durationSec}s ${cssEasing} forwards`;
      default:
        return `ssFadeIn ${durationSec}s ${cssEasing} forwards`;
    }
  };

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", display: "grid", placeItems: "center" }}>
      <style>{`
        @keyframes ssFadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes ssSlideLeft {
          0% { transform: translate3d(100%, 0, 0); opacity: ${setting.crossfade ? 0.3 : 1}; }
          100% { transform: translate3d(0, 0, 0); opacity: 1; }
        }
        @keyframes ssSlideRight {
          0% { transform: translate3d(-100%, 0, 0); opacity: ${setting.crossfade ? 0.3 : 1}; }
          100% { transform: translate3d(0, 0, 0); opacity: 1; }
        }
        @keyframes ssSlideUp {
          0% { transform: translate3d(0, 100%, 0); opacity: ${setting.crossfade ? 0.3 : 1}; }
          100% { transform: translate3d(0, 0, 0); opacity: 1; }
        }
        @keyframes ssSlideDown {
          0% { transform: translate3d(0, -100%, 0); opacity: ${setting.crossfade ? 0.3 : 1}; }
          100% { transform: translate3d(0, 0, 0); opacity: 1; }
        }
        @keyframes ssPushUpCrossfade {
          0% { transform: translate3d(0, 100%, 0); opacity: 0.3; }
          100% { transform: translate3d(0, 0, 0); opacity: 1; }
        }
        @keyframes ssZoomIn {
          0% { transform: scale3d(0.6, 0.6, 1); opacity: 0; }
          100% { transform: scale3d(1, 1, 1); opacity: 1; }
        }
        @keyframes ssZoomOut {
          0% { transform: scale3d(1.4, 1.4, 1); opacity: 0; }
          100% { transform: scale3d(1, 1, 1); opacity: 1; }
        }
      `}</style>

      {/* Stage Background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            category === "black"
              ? "#000"
              : category === "clear"
                ? "transparent"
                : "radial-gradient(circle at 50% 50%, rgba(123, 47, 247, 0.25), rgba(8, 9, 18, 0.95))",
        }}
      />

      {/* Animated Foreground Content */}
      <div
        style={{
          zIndex: 2,
          animation: getAnimation(),
          filter: filterBlur,
          willChange: "transform, opacity",
          WebkitBackfaceVisibility: "hidden",
          backfaceVisibility: "hidden",
          transformStyle: "preserve-3d",
          textAlign: "center",
          padding: "20px",
          color: "#ffffff",
        }}
      >
        {category === "scriptures" ? (
          <div>
            <div style={{ fontFamily: "Georgia, serif", fontSize: "16px", fontStyle: "italic", marginBottom: "8px" }}>
              "For God so loved the world that he gave his only begotten Son..."
            </div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "11px", fontWeight: 700, color: "var(--color-primary)" }}>
              John 3:16 (NKJV)
            </div>
          </div>
        ) : category === "songs" ? (
          <div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "15px", fontWeight: 700, marginBottom: "6px" }}>
              HOW GREAT IS OUR GOD
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", opacity: 0.8 }}>
              Sing with me how great is our God
            </div>
          </div>
        ) : category === "logo" ? (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 800, letterSpacing: "0.1em" }}>
            ❖ FOURSQUARE GOSPEL CHURCH
          </div>
        ) : category === "black" ? (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "#666" }}>
            [ BLACK OVERRIDE ACTIVE ]
          </div>
        ) : (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--fg-subtle)" }}>
            [ TEXT OVERLAY CLEARED ]
          </div>
        )}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: "6px",
          right: "10px",
          fontFamily: "var(--font-mono)",
          fontSize: "9px",
          color: "var(--fg-subtle)",
          background: "rgba(0,0,0,0.6)",
          padding: "2px 6px",
          borderRadius: "3px",
        }}
      >
        Effect: {setting.effect} ({setting.durationMs}ms)
      </div>
    </div>
  );
}
