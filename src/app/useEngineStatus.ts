import { useEffect, useState } from "react";
import { getSidecarHttpBase } from "../lib/sidecarClient";

export function useEngineStatus(enabled: boolean) {
  // SS-065: report the transcription model actually running, never a guess.
  // The sidecar can restart or fall back to another model; refresh the footer
  // while the operator is signed in.
  const [engineVersion, setEngineVersion] = useState("v0.1.0-native");
  const [engineModel, setEngineModel] = useState("");
  const [engineModelDegraded, setEngineModelDegraded] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let inFlight = false;
    const controller = new AbortController();
    interface EngineStatus {
      version?: string;
      transcription?: {
        configured_model?: string;
        loaded_model?: string | null;
        loaded?: boolean;
        degraded?: boolean | null;
        device?: string;
        compute_type?: string;
      };
    }

    const read = () => {
      if (inFlight) return;
      inFlight = true;
      void fetch(`${getSidecarHttpBase()}/api/engine/status`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: EngineStatus | null) => {
          if (!d || disposed) return;
          if (d.version) setEngineVersion(`v${d.version}`);
          const t = d.transcription;
          if (!t) return;
          const model = t.loaded_model ?? t.configured_model ?? "unknown";
          const pending = t.loaded ? "" : " \u22ef";
          setEngineModel(`${model} \u00b7 ${t.device}/${t.compute_type}${pending}`);
          setEngineModelDegraded(Boolean(t.degraded));
        })
        .catch(() => undefined)
        .finally(() => { inFlight = false; });
    };

    read();
    const timer = setInterval(read, 10000);
    return () => {
      disposed = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [enabled]);

  return { engineVersion, engineModel, engineModelDegraded };
}
