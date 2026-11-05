import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import { getSidecarHttpBase, getSidecarLogs, type SidecarLogEntry } from "../../lib/sidecarClient";
import {
  BOOT_POLL_MS,
  BOOT_SIMULATED_TIMES,
  BOOT_STEPS,
  BOOT_TIMEOUT_MS,
  DEFAULT_ENGINE_VERSION,
  type BootStep,
} from "./launchConstants";

export interface BootStatus {
  steps: readonly BootStep[];
  /** `performance.now()` when the pipeline first reported ready. */
  readyAt: number | undefined;
  /** Operator-facing failure text, or undefined. */
  error: string | undefined;
  retry: () => void;
  engineVersion: string;
}

const LAST_STEP = BOOT_STEPS.length - 1;

/**
 * The stage a log line implies, highest first: the first pattern that matches
 * wins, and progress is monotonic, so a whisper line also marks everything
 * before it done.
 *
 * These are matched against the sidecar's real output. During a model load
 * uvicorn has not bound its port yet (`/api/logs` refuses connections), so the
 * lines that drive this early on arrive over the `sidecar://log` Tauri events —
 * the same messages, straight off the child's stdout.
 */
const STAGE_PATTERNS: readonly { stage: number; pattern: RegExp }[] = [
  { stage: 5, pattern: /pipeline ready/i },
  {
    stage: 4,
    pattern: /streaming transcriber started|spoken[- ]only|groq|keyword index|trie built|semantic index/i,
  },
  { stage: 3, pattern: /loading whisper model|loading mlx-whisper|whisper configuration/i },
  { stage: 2, pattern: /\bvad\b|silero/i },
  { stage: 1, pattern: /bible|archived \d+ interrupted session/i },
];

function stageForLine(line: string): number {
  for (const { stage, pattern } of STAGE_PATTERNS) {
    if (pattern.test(line)) return stage;
  }
  // Anything at all from the sidecar means the engine process is up.
  return 0;
}

function furthestStage(lines: readonly string[]): number {
  return lines.reduce((furthest, line) => Math.max(furthest, stageForLine(line)), 0);
}

const isTauriRuntime = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

interface EngineStatusResponse {
  version?: string;
  transcription?: {
    configured_model?: string;
    loaded_model?: string | null;
    device?: string;
    compute_type?: string;
  };
}

/**
 * Real boot progress for the launch screen's status rows.
 *
 * The sidecar is the only source of truth: this polls `/api/logs` (which also
 * carries the `ready` flag) and listens for the raw process events, then maps
 * what it sees onto the six rows, timing each one. The engine version, the
 * Bible version count and the Whisper model/device come from the sidecar too,
 * so no row claims something that was not read off the engine.
 */
export function useBootStatus(): BootStatus {
  const [reached, setReached] = useState(-1);
  const [ready, setReady] = useState(false);
  const [readyAt, setReadyAt] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [generation, setGeneration] = useState(0);
  const [versionCount, setVersionCount] = useState<number | undefined>(undefined);
  const [whisperDetail, setWhisperDetail] = useState<string | undefined>(undefined);
  const [engineVersion, setEngineVersion] = useState(DEFAULT_ENGINE_VERSION);
  // `performance.now()` each stage was first reached, for the per-row duration.
  const [times, setTimes] = useState<readonly number[]>([]);
  const reachedRef = useRef(-1);

  const advance = useCallback((stage: number) => {
    if (stage <= reachedRef.current) return;
    const from = reachedRef.current;
    reachedRef.current = stage;
    const now = performance.now();
    setReached(stage);
    setTimes((current) => {
      const next = current.slice();
      // A line can jump several rows at once (a fast engine, or a log line we
      // only recognise late); the rows it skipped share its timestamp.
      for (let index = from + 1; index <= stage; index += 1) next[index] = now;
      return next;
    });
  }, []);

  const markReady = useCallback(() => {
    setReady(true);
    setReadyAt((current) => current ?? performance.now());
  }, []);

  // Raw stdout/stderr plus the hard failure signals. These fire independent of
  // the HTTP poll, so a crash or a pre-bind model load is visible immediately.
  useEffect(() => {
    let active = true;
    // `listen` rejects outside Tauri (a plain browser dev server), so each
    // subscription catches at creation rather than only on teardown.
    const subscribe = <T,>(event: string, handler: (payload: T) => void) =>
      listen<T>(event, (message) => handler(message.payload)).catch(() => undefined);

    const subscriptions = [
      subscribe<{ stream: string; line: string }>("sidecar://log", (payload) => {
        if (!active) return;
        advance(stageForLine(payload.line));
        if (/pipeline ready/i.test(payload.line)) markReady();
      }),
      subscribe<{ code: number | null }>("sidecar://exit", (payload) => {
        if (!active) return;
        setError(
          `engine process exited${payload.code !== null ? ` (code ${payload.code})` : ""} · see log`,
        );
      }),
      subscribe<{ message: string }>("sidecar://spawn-error", (payload) => {
        if (!active) return;
        setError(payload.message);
      }),
    ];

    return () => {
      active = false;
      subscriptions.forEach((promise) => void promise.then((unlisten) => unlisten?.()));
    };
  }, [advance, generation, markReady]);

  // HTTP poll: the structured log buffer and the `ready` flag.
  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const startedAt = performance.now();
    let answered = false;

    const poll = async () => {
      try {
        const response = await getSidecarLogs();
        if (!active) return;
        answered = true;
        setError(undefined);
        advance(furthestStage(response.logs.map((log: SidecarLogEntry) => log.message)));
        if (response.ready) {
          advance(LAST_STEP);
          markReady();
          return;
        }
      } catch {
        if (!active) return;
        // Connection refused is expected while the sidecar loads its model —
        // uvicorn has not bound the port yet. Only total silence is a failure.
        if (!answered && reachedRef.current < 0 && performance.now() - startedAt > BOOT_TIMEOUT_MS) {
          setError(`no answer from the engine after ${Math.round(BOOT_TIMEOUT_MS / 1000)}s · see log`);
        }
      }
      timer = window.setTimeout(() => void poll(), BOOT_POLL_MS);
    };

    void poll();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [advance, generation, markReady]);

  // Model, device, version count and engine version for the rows and the unit
  // stamp. Best effort: these answer only once the HTTP surface is up.
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const read = async () => {
      try {
        const [status, versions] = await Promise.all([
          fetch(`${getSidecarHttpBase()}/api/engine/status`, { signal: controller.signal }).then(
            (response) => (response.ok ? (response.json() as Promise<EngineStatusResponse>) : null),
          ),
          fetch(`${getSidecarHttpBase()}/api/bible/versions`, { signal: controller.signal }).then(
            (response) => (response.ok ? (response.json() as Promise<unknown>) : null),
          ),
        ]);
        if (!active) return;
        if (status?.version) setEngineVersion(status.version);
        const transcription = status?.transcription;
        if (transcription) {
          const model = transcription.loaded_model ?? transcription.configured_model;
          const device =
            transcription.device && transcription.compute_type
              ? ` · ${transcription.device}/${transcription.compute_type}`
              : "";
          if (model) setWhisperDetail(`${model}${device}`);
        }
        const payload = versions as { versions?: unknown[] } | unknown[] | null;
        const list = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.versions)
            ? payload.versions
            : null;
        if (list) {
          setVersionCount(list.length);
          // The Bible database really is open if it just listed its versions.
          advance(1);
        }
      } catch {
        if (!active) return;
      }
    };

    void read();
    const timer = window.setInterval(() => void read(), BOOT_POLL_MS * 4);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [advance, generation]);

  // Browser-only fallback: no Tauri shell means no sidecar was spawned, so walk
  // the rows on the reference's timing. A real sidecar overtakes this.
  useEffect(() => {
    if (!import.meta.env.DEV || isTauriRuntime()) return;
    const timers = BOOT_SIMULATED_TIMES.map((offset, index) =>
      window.setTimeout(() => {
        advance(index);
        if (index === LAST_STEP) markReady();
      }, offset),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [advance, generation, markReady]);

  const retry = useCallback(() => {
    // The sidecar process is spawned once by the Rust `setup` hook, so there is
    // nothing here to respawn: this clears the failure and resumes polling, for
    // the case where the engine is slow rather than gone.
    setError(undefined);
    setGeneration((value) => value + 1);
  }, []);

  const steps = useMemo<readonly BootStep[]>(() => {
    const errorStage = error === undefined ? undefined : Math.max(0, reached);
    return BOOT_STEPS.map((step, index) => {
      let label: string = step.label;
      if (step.key === "bible" && versionCount !== undefined) {
        label = `${step.label} · ${versionCount} version${versionCount === 1 ? "" : "s"}`;
      }
      if (step.key === "whisper" && whisperDetail !== undefined) {
        label = `${step.label} · ${whisperDetail}`;
      }

      if (index === errorStage) {
        return { key: step.key, label, state: "err", meta: "failed" };
      }
      if (index < reached || (ready && index === LAST_STEP)) {
        const next = times[index + 1];
        const own = times[index];
        // The last row is the pipeline being ready, not a step with a duration.
        const meta =
          index === LAST_STEP || next === undefined || own === undefined
            ? ""
            : formatSeconds(next - own);
        return { key: step.key, label, state: "done", meta };
      }
      if (index === reached) {
        return { key: step.key, label, state: "active" };
      }
      return { key: step.key, label, state: "pending" };
    });
  }, [error, ready, reached, times, versionCount, whisperDetail]);

  return { steps, readyAt, error, retry, engineVersion };
}
