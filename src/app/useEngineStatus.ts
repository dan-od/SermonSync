import { useEffect, useState } from "react";

import { getSidecarHttpBase } from "../lib/sidecarClient";

export function useEngineStatus() {
  // SS-065: report the transcription model actually running, never a guess.
  // Polled because the model loads lazily on the first utterance, so the footer
  // must flip from configured to loaded when that happens.
  const [engineVersion, setEngineVersion] = useState("v0.1.0-native");
  const [engineModel, setEngineModel] = useState("");
  const [engineModelDegraded, setEngineModelDegraded] = useState(false);

  useEffect(() => {
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

    const read = () =>
      fetch(`${getSidecarHttpBase()}/api/engine/status`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: EngineStatus | null) => {
          if (!d) return;
          if (d.version) setEngineVersion(`v${d.version}`);
          const t = d.transcription;
          if (!t) return;
          const model = t.loaded_model ?? t.configured_model ?? "unknown";
          const pending = t.loaded ? "" : " \u22ef";
          setEngineModel(`${model} \u00b7 ${t.device}/${t.compute_type}${pending}`);
          setEngineModelDegraded(Boolean(t.degraded));
        })
        .catch(() => undefined);

    read();
    const timer = setInterval(read, 10000);
    return () => clearInterval(timer);
  }, []);

  return { engineVersion, engineModel, engineModelDegraded };
}
