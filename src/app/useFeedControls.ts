import { useCallback, type RefObject } from "react";
import type { LibraryNavigationHandler } from "../components/Library/types";
import { useProjectorStore } from "../stores";

export function useFeedControls(libraryNavigationRef: RefObject<LibraryNavigationHandler | null>) {
  const feedOverride = useProjectorStore((s) => s.feedOverride);
  const setFeedOverride = useProjectorStore((s) => s.setFeedOverride);
  const setPreviewSlide = useProjectorStore((s) => s.setPreview);

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
  }, [libraryNavigationRef, setPreviewSlide]);

  return { handleFeedOverrideChange, toggleFeedOverride, cycleLive };
}
