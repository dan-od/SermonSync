import { useState, type ReactNode } from "react";

import { EnterTransition } from "../../projector/EnterTransition";
import { getTransitionSetting, TRANSITION_CATEGORIES, TRANSITION_PRESETS } from "../../../lib/transitions";
import { IconBook, IconEyeOff, IconLayout, IconMonitor, IconSparkles, IconTransition } from "../icons";
import { SectionIntro, SelectRow, SettingsCard, SliderRow } from "../primitives";
import type { SettingsPanelState, TransitionCategory, TransitionEasing, TransitionEffect, TransitionSetting } from "../types";

interface TransitionsTabProps {
  panelState: SettingsPanelState;
  onPanelChange: <K extends keyof SettingsPanelState>(key: K, value: SettingsPanelState[K]) => void;
}

const CATEGORY_META: Record<TransitionCategory, { title: string; subtitle: string; icon: ReactNode; sample: string }> = {
  scriptures: { title: "Scripture Slides", subtitle: "When displaying or switching scripture verses", icon: <IconBook />, sample: "John 3:16" },
  songs: { title: "Song Lyrics", subtitle: "When advancing through worship song slides", icon: <IconSparkles />, sample: "How great is our God" },
  layout: { title: "Screen Layout", subtitle: "When switching between Widescreen Slide and Lower Third", icon: <IconLayout />, sample: "Layout change" },
  logo: { title: "Logo Override", subtitle: "When switching to the church logo", icon: <IconMonitor />, sample: "❖ LOGO" },
  black: { title: "Black Screen", subtitle: "When activating the black screen override", icon: <IconLayout />, sample: "BLACK" },
  clear: { title: "Clear Screen", subtitle: "When clearing text overlays", icon: <IconEyeOff />, sample: "CLEAR" },
};

const EFFECT_OPTIONS: { value: TransitionEffect; label: string }[] = [
  { value: "fade", label: "Fade" },
  { value: "slide-left", label: "Slide Left" },
  { value: "slide-right", label: "Slide Right" },
  { value: "slide-up", label: "Slide Up" },
  { value: "slide-down", label: "Slide Down" },
  { value: "zoom-in", label: "Zoom In" },
  { value: "zoom-out", label: "Zoom Out" },
  { value: "cut", label: "Instant Cut" },
];

const EASING_OPTIONS: { value: TransitionEasing; label: string }[] = [
  { value: "ease-in-out", label: "Ease In-Out (Smooth)" },
  { value: "ease", label: "Ease (Standard)" },
  { value: "ease-out", label: "Ease Out (Decelerate)" },
  { value: "ease-in", label: "Ease In (Accelerate)" },
  { value: "linear", label: "Linear" },
  { value: "spring", label: "Spring (Elastic)" },
];

const buttonStyle = (active = false) => ({
  border: "none",
  borderRadius: "var(--radius-md)",
  background: active ? "var(--color-primary)" : "var(--bg-elevated)",
  color: active ? "#fff" : "var(--fg-base)",
  padding: "6px 12px",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-xs)",
  fontWeight: 600,
  cursor: "pointer",
}) as const;

const panelStyle = {
  background: "var(--bg-surface)",
  borderRadius: "var(--radius-lg)",
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  boxShadow: "var(--shadow-sm)",
} as const;

export function TransitionsTab({ panelState, onPanelChange }: TransitionsTabProps) {
  const [active, setActive] = useState<TransitionCategory>("scriptures");
  const [replay, setReplay] = useState(0);
  const { transitions } = panelState;
  const transitionsEnabled = transitions.enabled !== false;

  const select = (category: TransitionCategory) => {
    setActive(category);
    setReplay((n) => n + 1);
  };
  const update = (category: TransitionCategory, patch: Partial<TransitionSetting>) => {
    onPanelChange("transitions", { ...transitions, [category]: { ...transitions[category], ...patch } });
    select(category);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <SectionIntro
        title="Screen Transitions & Motion"
        description="Choose how each kind of screen change enters: effect, speed and easing."
        action={
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, color: "var(--fg-muted)" }}>
              {transitionsEnabled ? "ON" : "OFF"}
            </span>
            <button
              type="button"
              role="switch"
              aria-label="Enable screen transitions"
              aria-checked={transitionsEnabled}
              onClick={() => onPanelChange("transitions", { ...transitions, enabled: !transitionsEnabled })}
              style={{
                position: "relative",
                width: "36px",
                height: "20px",
                padding: 0,
                border: "none",
                borderRadius: "var(--radius-full)",
                cursor: "pointer",
                background: transitionsEnabled ? "var(--color-primary)" : "var(--border-base)",
                transition: "background-color 150ms ease",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: "2px",
                  left: transitionsEnabled ? "18px" : "2px",
                  width: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  background: "var(--fg-on-accent)",
                  transition: "left 150ms ease",
                }}
              />
            </button>
          </div>
        }
      />

      <div
        inert={!transitionsEnabled}
        aria-disabled={!transitionsEnabled}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-6)",
          opacity: transitionsEnabled ? 1 : 0.45,
          filter: transitionsEnabled ? "none" : "grayscale(0.6)",
          transition: "opacity 150ms ease",
        }}
      >
      <div style={panelStyle}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", color: "var(--fg-muted)" }}>PRESETS</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {TRANSITION_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              style={buttonStyle()}
              onClick={() => {
                onPanelChange("transitions", { ...preset.config, enabled: transitionsEnabled });
                setReplay((n) => n + 1);
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div style={panelStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", color: "var(--color-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
            <IconTransition style={{ width: 14, height: 14 }} /> PREVIEW
          </span>
          <button type="button" style={buttonStyle(true)} onClick={() => setReplay((n) => n + 1)}>▷ Play</button>
        </div>
        <div style={{ display: "flex", gap: "4px", background: "var(--bg-elevated)", padding: "3px", borderRadius: "6px" }}>
          {TRANSITION_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => select(category)}
              style={{ ...buttonStyle(active === category), flex: 1, padding: "6px 4px", fontFamily: "var(--font-mono)", fontSize: "10px", textTransform: "uppercase" }}
            >
              {category}
            </button>
          ))}
        </div>
        <div style={{ height: "160px", borderRadius: "var(--radius-md)", background: "#080912", overflow: "hidden", display: "grid", placeItems: "center", border: "1px solid var(--border-base)" }}>
          <EnterTransition setting={getTransitionSetting(transitions, active)} trigger={`${active}:${replay}`} style={{ color: "#fff", fontFamily: "var(--font-sans)", fontSize: "20px", fontWeight: 700 }}>
            {CATEGORY_META[active].sample}
          </EnterTransition>
        </div>
      </div>

      {TRANSITION_CATEGORIES.map((category) => {
        const meta = CATEGORY_META[category];
        const setting = transitions[category];
        return (
          <SettingsCard key={category} icon={meta.icon} title={meta.title} subtitle={meta.subtitle}>
            <SelectRow label="Effect" value={setting.effect} options={EFFECT_OPTIONS} onChange={(effect) => update(category, { effect: effect as TransitionEffect })} />
            <SliderRow label="Duration" value={setting.durationMs} min={0} max={2000} step={25} unit="ms" onChange={(durationMs) => update(category, { durationMs })} />
            <SelectRow label="Easing" value={setting.easing} options={EASING_OPTIONS} onChange={(easing) => update(category, { easing: easing as TransitionEasing })} />
          </SettingsCard>
        );
      })}
      </div>
    </div>
  );
}
