#!/usr/bin/env node
// Runs before `npm run dev` (predev hook) — also triggered by `npx tauri dev`
// via its beforeDevCommand.
//
// Why this exists:
// - Tauri's devUrl is hard-coded to http://localhost:1420
//   (src-tauri/tauri.conf.json) and vite.config.ts sets strictPort, so Vite
//   must bind exactly 1420.
// - When the app shuts down, the `npm run dev` -> sh -> vite process chain is
//   not always torn down cleanly, leaving an orphaned Vite server that holds
//   1420. The next `tauri dev` then fails with "Port 1420 is already in use"
//   — or worse, the app window loads the *stale* frontend from the orphan.
//
// This script kills leftover listeners on 1420 so every dev start is clean.
// Port 8000 (Python sidecar) is only reported, never killed: some workflows
// run the sidecar manually on purpose.
import { execFileSync } from 'node:child_process';

const VITE_PORT = 1420;
const SIDECAR_PORT = 8000;

function pidsOnPort(port) {
  // Linux (fuser from psmisc). PIDs go to stdout; "port/tcp:" header to stderr.
  try {
    const out = execFileSync('fuser', [`${port}/tcp`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const pids = out.trim().split(/\s+/).filter(Boolean);
    if (pids.length) return pids;
  } catch {
    /* fuser missing or nothing listening */
  }
  // macOS / BSD fallback.
  try {
    const out = execFileSync('lsof', ['-ti', `:${port}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim().split(/\s+/).filter(Boolean);
  } catch {
    /* nothing listening or lsof missing */
  }
  return [];
}

function describe(pids) {
  return pids
    .map((pid) => {
      try {
        const cmd = execFileSync('ps', ['-o', 'args=', '-p', pid], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        return `${pid} (${cmd})`;
      } catch {
        return pid;
      }
    })
    .join(', ');
}

// --- Vite port: kill orphans so strictPort never trips on stale servers ---
const vitePids = pidsOnPort(VITE_PORT);
if (vitePids.length) {
  console.log(
    `[predev] port ${VITE_PORT} held by stale process(es): ${describe(vitePids)} — killing`
  );
  for (const pid of vitePids) {
    try {
      process.kill(Number(pid), 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
}

// --- Sidecar port: warn only (may be an intentional manual instance) ---
const sidecarPids = pidsOnPort(SIDECAR_PORT);
if (sidecarPids.length) {
  console.warn(
    `[predev] note: sidecar port ${SIDECAR_PORT} already in use by: ${describe(sidecarPids)}`
  );
  console.warn('[predev] the app spawns its own sidecar in dev; kill the above if it is stale.');
}
