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
// Port 8000 is cleaned up when it is occupied by a stale SermonSync sidecar.
// Unrelated services are only reported and are never killed.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VITE_PORT = 1420;
const SIDECAR_PORT = 8000;
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIDECAR_DIR = path.join(PROJECT_ROOT, 'python-sidecar');

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

function processInfo(pid) {
  let args = '';
  let cwd = '';
  try {
    args = execFileSync('ps', ['-o', 'args=', '-p', pid], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }

  // Linux gives us the process working directory, which identifies the
  // development sidecar even when its command line only says "python main.py".
  try {
    cwd = fs.realpathSync(`/proc/${pid}/cwd`);
  } catch {
    /* /proc is unavailable on non-Linux hosts */
  }

  return { args, cwd };
}

function isSermonSyncSidecar(pid) {
  const info = processInfo(pid);
  if (!info || !/main\.py(?:\s|$)/.test(info.args)) return false;

  const normalizedArgs = info.args.replaceAll('\\', '/');
  const normalizedSidecarDir = SIDECAR_DIR.replaceAll('\\', '/');
  return info.cwd === SIDECAR_DIR || normalizedArgs.includes(`${normalizedSidecarDir}/main.py`);
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

// --- Sidecar port: stop stale SermonSync instances, preserve foreign services ---
const sidecarPids = pidsOnPort(SIDECAR_PORT);
if (sidecarPids.length) {
  const managedPids = sidecarPids.filter(isSermonSyncSidecar);
  const foreignPids = sidecarPids.filter((pid) => !managedPids.includes(pid));

  if (managedPids.length) {
    console.log(
      `[predev] stopping stale SermonSync sidecar(s) on ${SIDECAR_PORT}: ${describe(managedPids)}`
    );
    for (const pid of managedPids) {
      try {
        process.kill(Number(pid), 'SIGKILL');
      } catch {
        /* already gone */
      }
    }
  }

  if (foreignPids.length) {
    console.warn(
      `[predev] port ${SIDECAR_PORT} is also used by an unrelated process: ${describe(foreignPids)}`
    );
    console.warn('[predev] SermonSync cannot safely stop that process; Tauri sidecar startup may fail until the port is free.');
  }
}
