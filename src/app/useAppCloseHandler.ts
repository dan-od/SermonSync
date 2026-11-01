import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSessionStore } from "../stores";

export function useAppCloseHandler() {
  const closingRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen("app://close-requested", () => {
      if (closingRef.current) return;
      closingRef.current = true;

      void (async () => {
        try {
          await useSessionStore.getState().end();
          await invoke("close_app");
        } catch (error) {
          closingRef.current = false;
          console.error("Failed to close app cleanly", error);
        }
      })();
    }).then((stopListening) => {
      if (disposed) stopListening();
      else unlisten = stopListening;
    }).catch((error: unknown) => {
      console.error("Failed to register app close handler", error);
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
