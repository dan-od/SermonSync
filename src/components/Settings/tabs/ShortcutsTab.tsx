import { useEffect, useState } from "react";

import {
  SHORTCUT_DEFINITIONS,
  shortcutFromEvent,
  useShortcutStore,
  type ShortcutAction,
} from "../../../stores/shortcutStore";
import { IconKeyboard } from "../icons";
import { SectionIntro, SettingsCard } from "../primitives";

const CATEGORIES = ["Live feed", "Screen layout", "Local library", "Workspace", "Template Studio"] as const;

export function ShortcutsTab({ active }: { active: boolean }) {
  const shortcuts = useShortcutStore((state) => state.shortcuts);
  const setShortcut = useShortcutStore((state) => state.setShortcut);
  const resetShortcuts = useShortcutStore((state) => state.resetShortcuts);
  const [recordingAction, setRecordingAction] = useState<ShortcutAction | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !recordingAction) return;
    const captureShortcut = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      if (event.key === "Escape") {
        setRecordingAction(null);
        setConflict(null);
        return;
      }

      const binding = shortcutFromEvent(event);
      if (!binding) return;
      const existing = SHORTCUT_DEFINITIONS.find((entry) => entry.action !== recordingAction && shortcuts[entry.action] === binding);
      if (existing) {
        setConflict(`${binding} is already assigned to ${existing.label}.`);
        return;
      }

      setShortcut(recordingAction, binding);
      setRecordingAction(null);
      setConflict(null);
    };
    document.addEventListener("keydown", captureShortcut, true);
    return () => document.removeEventListener("keydown", captureShortcut, true);
  }, [active, recordingAction, setShortcut, shortcuts]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <SectionIntro
        title="Keyboard Shortcuts"
        description="Choose the keys that match your operator workflow. Changes apply immediately and stay on this device."
      />

      <SettingsCard
        icon={<IconKeyboard />}
        title="Operator Controls"
        subtitle="Select a shortcut, then press its new key combination. Press Escape to cancel."
        footer={
          <button
            type="button"
            onClick={() => {
              resetShortcuts();
              setRecordingAction(null);
              setConflict(null);
            }}
            style={{ border: "none", background: "transparent", color: "var(--color-primary)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700 }}
          >
            Restore default shortcuts
          </button>
        }
      >
        {CATEGORIES.map((category) => {
          const definitions = SHORTCUT_DEFINITIONS.filter((entry) => entry.category === category);
          return (
            <div key={category} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                {category}
              </span>
              {definitions.map((definition) => {
                const isRecording = recordingAction === definition.action;
                return (
                  <div key={definition.action} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", padding: "9px 10px", background: "var(--bg-base)", borderRadius: "var(--radius-md)" }}>
                    <span style={{ color: "var(--fg-base)", fontSize: "var(--text-xs)", fontWeight: 600 }}>{definition.label}</span>
                    <button
                      type="button"
                      aria-label={`Change shortcut for ${definition.label}`}
                      onClick={() => {
                        setRecordingAction(definition.action);
                        setConflict(null);
                      }}
                      style={{ minWidth: "104px", border: "1px solid var(--border-base)", borderRadius: "var(--radius-sm)", padding: "4px 8px", background: isRecording ? "var(--color-primary-muted)" : "var(--bg-elevated)", color: isRecording ? "var(--color-primary)" : "var(--fg-base)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700 }}
                    >
                      {isRecording ? "Press keys" : shortcuts[definition.action]}
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
        {conflict ? <p role="alert" style={{ margin: 0, color: "var(--color-error)", fontSize: "var(--text-xs)" }}>{conflict}</p> : null}
      </SettingsCard>
    </div>
  );
}
