import type { LibraryTab } from "../components/Library/types";
import { useEffect } from "react";
import { useProjectorStore } from "../stores";
import { SHORTCUT_DEFINITIONS, isShortcutEvent, useShortcutStore } from "../stores/shortcutStore";
import { isEditableTarget } from "./helpers";

export function useShortcutHandlers({ cycleLive, handleFeedOverrideChange, isSettingsOpen, previewSlide, sendLiveSlide, setOverlayMode, setLibraryTab, setIsSettingsOpen, shortcuts, toggleFeedOverride }: { setLibraryTab: (tab: LibraryTab) => void; setIsSettingsOpen: (open: boolean) => void; cycleLive: (direction: -1 | 1) => void; handleFeedOverrideChange: (mode: ReturnType<typeof useProjectorStore.getState>["feedOverride"]) => void; toggleFeedOverride: (mode: Exclude<ReturnType<typeof useProjectorStore.getState>["feedOverride"], "live">) => void; isSettingsOpen: boolean; previewSlide: ReturnType<typeof useProjectorStore.getState>["previewSlide"]; sendLiveSlide: ReturnType<typeof useProjectorStore.getState>["sendLive"]; setOverlayMode: ReturnType<typeof useProjectorStore.getState>["setOverlayMode"]; shortcuts: ReturnType<typeof useShortcutStore.getState>["shortcuts"] }) {
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
          toggleFeedOverride("logo");
          break;
        case "feed-black":
          toggleFeedOverride("black");
          break;
        case "feed-clear":
          toggleFeedOverride("clear");
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
        case "library-tab-scriptures":
          setLibraryTab("scriptures");
          break;
        case "library-tab-songs":
          setLibraryTab("songs");
          break;
        case "library-tab-media":
          setLibraryTab("media");
          break;
        case "library-tab-overlays":
          setLibraryTab("overlays");
          break;
        case "library-tab-templates":
          setLibraryTab("templates");
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
  }, [cycleLive, handleFeedOverrideChange, isSettingsOpen, previewSlide, sendLiveSlide, setOverlayMode, setLibraryTab, setIsSettingsOpen, shortcuts, toggleFeedOverride]);
}
