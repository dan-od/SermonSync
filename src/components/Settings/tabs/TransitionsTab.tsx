import { useState } from "react";

import { IconBook, IconEyeOff, IconLayout, IconMonitor, IconSparkles, IconTransition } from "../icons";
import { SectionIntro, SelectRow, SettingsCard, SliderRow, ToggleRow } from "../primitives";
import type {
  SettingsPanelState,
  TransitionEasing,
  TransitionEffect,
  TransitionSetting,
} from "../types";
import { TransitionPresetButtons } from "./TransitionPresetButtons";
import { TransitionPreviewStage } from "./TransitionPreviewStage";
import {
  EASING_OPTIONS,
  EFFECT_OPTIONS,
  getTransitionPreset,
  type TransitionCategory,
  type TransitionPresetId,
} from "./transitionPresets";

interface TransitionsTabProps {
  panelState: SettingsPanelState;
  onPanelChange: <K extends keyof SettingsPanelState>(key: K, value: SettingsPanelState[K]) => void;
}

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

  const applyPreset = (preset: TransitionPresetId) => {
    const next = getTransitionPreset(preset);
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
      <TransitionPresetButtons onApplyPreset={applyPreset} />

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
