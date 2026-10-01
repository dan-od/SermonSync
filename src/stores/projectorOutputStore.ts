/**
 * SS-036: congregation output window state, owned by the operator window.
 *
 * Only the operator's choices persist (which display, whether output is on,
 * test-window mode). Everything else is rediscovered at runtime, so a restart
 * reopens the output on the same display, and an unplugged display parks the
 * output instead of letting the OS drop it onto the operator's screen.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  closeProjectorWindow,
  errorMessage,
  isTauriRuntime,
  listDisplays,
  openProjectorWindow,
  resolveDisplay,
  type DisplayInfo,
  type ProjectorVideoControl,
} from "../lib/projectorOutput";
import { getBrowserStorage } from "./persistStorage";

export type ProjectorOutputStatus = "off" | "opening" | "on" | "waiting-for-display" | "error";

interface ProjectorOutputState {
  displays: DisplayInfo[];
  selectedDisplayId: string | null;
  outputEnabled: boolean;
  windowed: boolean;
  windowOpen: boolean;
  activeDisplay: DisplayInfo | null;
  status: ProjectorOutputStatus;
  error: string | null;
  /** Play/pause/loop of the LIVE background video, mirrored to the projector. */
  liveVideo: ProjectorVideoControl;
}

interface ProjectorOutputActions {
  refreshDisplays: () => Promise<DisplayInfo[]>;
  selectDisplay: (displayId: string | null) => Promise<void>;
  turnOn: (options?: { windowed?: boolean }) => Promise<void>;
  turnOff: () => Promise<void>;
  reconcile: () => Promise<void>;
  handleWindowClosed: () => void;
  setLiveVideo: (video: ProjectorVideoControl) => void;
  reset: () => void;
}

export type ProjectorOutputStore = ProjectorOutputState & ProjectorOutputActions;

const initialState: ProjectorOutputState = {
  displays: [],
  selectedDisplayId: null,
  outputEnabled: false,
  windowed: false,
  windowOpen: false,
  activeDisplay: null,
  status: "off",
  error: null,
  liveVideo: { playing: true, loop: true },
};

// Set when this module closes the window itself (turn off, display unplugged),
// so the resulting "closed" event is not mistaken for the operator closing it.
let closingOurselves = false;
let closingResetTimer: ReturnType<typeof setTimeout> | null = null;

function markClosingOurselves() {
  closingOurselves = true;
  if (closingResetTimer) clearTimeout(closingResetTimer);
  // If no closed event ever arrives, don't swallow a later operator close.
  closingResetTimer = setTimeout(() => {
    closingOurselves = false;
    closingResetTimer = null;
  }, 3000);
}

function clearClosingOurselves() {
  closingOurselves = false;
  if (closingResetTimer) clearTimeout(closingResetTimer);
  closingResetTimer = null;
}

// Window operations run one at a time so the reconcile timer never races a
// turn-on or a display change. Operator actions queue; the timer skips a tick
// instead of piling up behind them.
let busy = false;
let queueTail: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queueTail.then(async () => {
    busy = true;
    try {
      return await task();
    } finally {
      busy = false;
    }
  });
  queueTail = run.catch(() => undefined);
  return run;
}

function defaultDisplayId(displays: DisplayInfo[]): string | null {
  return displays.find((display) => !display.isOperatorDisplay)?.id ?? null;
}

export const useProjectorOutputStore = create<ProjectorOutputStore>()(
  persist(
    (set, get) => {
      const fetchDisplays = async (): Promise<DisplayInfo[]> => {
        if (!isTauriRuntime()) return [];
        const displays = await listDisplays();
        const { selectedDisplayId } = get();
        // Keep a selection whose display is unplugged: that's how we know where
        // to reopen when it comes back. Only fill in a selection that was never made.
        const nextSelected = selectedDisplayId ?? defaultDisplayId(displays);
        // A display that returns at new coordinates gets a new id; follow it.
        const resolved = resolveDisplay(displays, nextSelected);
        set({ displays, selectedDisplayId: resolved?.id ?? nextSelected });
        return displays;
      };

      const open = async (windowed: boolean) => {
        const displays = await fetchDisplays();
        const target = resolveDisplay(displays, get().selectedDisplayId);
        if (!windowed && !target) {
          if (get().selectedDisplayId) {
            // Remembered display isn't connected (yet). Stay armed and wait.
            set({ outputEnabled: true, windowed: false, windowOpen: false, activeDisplay: null, status: "waiting-for-display", error: null });
          } else {
            set({ status: "error", error: "Choose a display for the congregation output." });
          }
          return;
        }
        set({ status: "opening", error: null });
        try {
          const result = await openProjectorWindow(windowed ? null : target!.id, windowed);
          set({
            outputEnabled: true,
            windowed,
            windowOpen: result.open,
            activeDisplay: result.display,
            status: "on",
            error: null,
          });
        } catch (error) {
          set({
            outputEnabled: false,
            windowOpen: false,
            activeDisplay: null,
            status: "error",
            error: errorMessage(error, "Could not open the output window."),
          });
        }
      };

      const close = async () => {
        if (get().windowOpen) markClosingOurselves();
        try {
          await closeProjectorWindow();
        } catch (error) {
          clearClosingOurselves();
          throw error;
        }
      };

      return {
        ...initialState,

        refreshDisplays: async () => {
          try {
            return await fetchDisplays();
          } catch (error) {
            set({ error: errorMessage(error, "Could not list displays.") });
            return get().displays;
          }
        },

        selectDisplay: async (displayId) => {
          set({ selectedDisplayId: displayId });
          const { outputEnabled, windowed } = get();
          if (!outputEnabled || windowed) return;
          if (!displayId) {
            await serialized(async () => {
              await close().catch(() => undefined);
              set({ outputEnabled: false, windowOpen: false, activeDisplay: null, status: "off" });
            });
            return;
          }
          // Output is live: move it to the newly chosen display.
          await serialized(() => open(false));
        },

        turnOn: async (options) => {
          const windowed = options?.windowed ?? get().windowed;
          await serialized(() => open(windowed));
        },

        turnOff: async () => {
          await serialized(async () => {
            try {
              await close();
              set({ outputEnabled: false, windowOpen: false, activeDisplay: null, status: "off", error: null });
            } catch (error) {
              set({ status: "error", error: errorMessage(error, "Could not close the output window.") });
            }
          });
        },

        reconcile: async () => {
          const { outputEnabled, windowed } = get();
          if (!outputEnabled || windowed || busy || !isTauriRuntime()) return;
          await serialized(async () => {
            let displays: DisplayInfo[];
            try {
              displays = await fetchDisplays();
            } catch {
              return;
            }
            const { status, windowOpen, selectedDisplayId, activeDisplay } = get();
            const target = resolveDisplay(displays, selectedDisplayId);

            if (!target) {
              if (windowOpen) {
                // Never let the OS move congregation output onto the operator screen.
                await close().catch(() => undefined);
              }
              if (status !== "waiting-for-display") {
                set({ windowOpen: false, activeDisplay: null, status: "waiting-for-display", error: null });
              }
              return;
            }

            const moved = activeDisplay !== null && (
              activeDisplay.id !== target.id
              || activeDisplay.width !== target.width
              || activeDisplay.height !== target.height
            );
            if (status === "waiting-for-display" || (status === "on" && (!windowOpen || moved))) {
              await open(false);
            }
          });
        },

        handleWindowClosed: () => {
          if (closingOurselves) {
            clearClosingOurselves();
            set({ windowOpen: false });
            return;
          }
          // The operator closed it (Alt+F4 / the X on the test window).
          set({ outputEnabled: false, windowOpen: false, activeDisplay: null, status: "off" });
        },

        setLiveVideo: (liveVideo) => set({ liveVideo }),

        reset: () => {
          clearClosingOurselves();
          set({ ...initialState });
        },
      };
    },
    {
      name: "sermonsync-projector-output",
      storage: createJSONStorage(getBrowserStorage),
      partialize: (state) => ({
        selectedDisplayId: state.selectedDisplayId,
        outputEnabled: state.outputEnabled,
        windowed: state.windowed,
      }),
    },
  ),
);
