import { useEffect } from "react";

import { useProjectorStore } from "../stores";
import { SHORTCUT_DEFINITIONS, isShortcutEvent, useShortcutStore } from "../stores/shortcutStore";
import type { ProjectorSlide } from "../types/state";
import { isEditableTarget } from "./slideHelpers";

type ProjectorStoreState = ReturnType<typeof useProjectorStore.getState>;

export function useOperatorShortcuts({
  isSettingsOpen,
  setIsSettingsOpen,
  shortcuts,
  previewSlide,
  cycleLive,
  handleFeedOverrideChange,
  setOverlayMode,
  sendLiveSlide,
}: {
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  shortcuts: ReturnType<typeof useShortcutStore.getState>["shortcuts"];
  previewSlide: ProjectorSlide | null;
  cycleLive: (direction: -1 | 1) => void;
  handleFeedOverrideChange: (mode: ProjectorStoreState["feedOverride"]) => void;
  setOverlayMode: ProjectorStoreState["setOverlayMode"];
  sendLiveSlide: ProjectorStoreState["sendLive"];
}) {
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
  }, [cycleLive, handleFeedOverrideChange, isSettingsOpen, previewSlide, sendLiveSlide, setIsSettingsOpen, setOverlayMode, shortcuts]);
}
