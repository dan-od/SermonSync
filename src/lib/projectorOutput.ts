import { invoke } from "@tauri-apps/api/core";
import {
  availableMonitors,
  primaryMonitor,
  type Monitor,
} from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

import { useProjectorStore } from "../stores/projectorStore";
import type { DisplayInfo, ProjectorOutputSnapshot } from "../types/state";
import { postProjectorChannelMessage, subscribeProjectorChannel } from "./projectorChannel";

export const PROJECTOR_OUTPUT_LABEL = "projector-output";
export const PROJECTOR_OUTPUT_STATE_EVENT = "projector://state";
export const PROJECTOR_OUTPUT_READY_EVENT = "projector://ready";
export const PROJECTOR_OUTPUT_ACK_EVENT = "projector://applied";

interface NativeDisplayInfo {
  nativeId: number;
  name: string;
  friendlyName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  logicalX: number;
  logicalY: number;
  logicalWidth: number;
  logicalHeight: number;
  scaleFactor: number;
  refreshHz: number | null;
  isPrimary: boolean;
}

let lastSnapshot: ProjectorOutputSnapshot = makeSnapshot();
let lastPublishedRevision = 0;
let lastAcknowledgedRevision = 0;
let lastAppliedDisplayFingerprint: string | null = null;
let publishChain: Promise<void> = Promise.resolve();
let pendingSnapshot: ProjectorOutputSnapshot | null = null;
let publishScheduled = false;
let publishWaiters: Array<() => void> = [];
let displayDiscoveryInFlight: Promise<DisplayInfo[]> | null = null;
let outputOperation: Promise<void> = Promise.resolve();

function makeSnapshot(): ProjectorOutputSnapshot {
  const state = useProjectorStore.getState();
  return {
    slide: state.liveSlide,
    media: state.liveMedia,
    overlays: state.activeOverlays,
    feedOverride: state.feedOverride,
    overlayMode: state.overlayMode,
    theme: state.theme,
    transitions: state.transitions,
    logo: state.logo,
    playback: state.livePlayback,
  };
}

function normalized(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function stableDisplayId(native: NativeDisplayInfo | undefined, monitor: Monitor, index: number) {
  const connector = normalized(monitor.name || native?.name || `display-${index + 1}`);
  const friendlyName = normalized(native?.friendlyName);
  const seed = `${connector}|${friendlyName || monitor.size.width + "x" + monitor.size.height}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `display-${(hash >>> 0).toString(16)}`;
}

function stableNativeDisplayId(native: NativeDisplayInfo, index: number) {
  const seed = `${normalized(native.name || `display-${index + 1}`)}|${normalized(native.friendlyName)}|${native.width}x${native.height}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `display-${(hash >>> 0).toString(16)}`;
}

function nativeMatch(native: NativeDisplayInfo, monitor: Monitor) {
  if (normalized(native.name) && normalized(native.name) === normalized(monitor.name)) return true;
  const scales = [native.scaleFactor, monitor.scaleFactor, 1].filter((scale, index, values) => scale > 0 && values.indexOf(scale) === index);
  return scales.some((scale) => (
    Math.abs(Math.round(native.x * scale) - monitor.position.x) <= 2
    && Math.abs(Math.round(native.y * scale) - monitor.position.y) <= 2
    && Math.abs(Math.round(native.width * scale) - monitor.size.width) <= 2
    && Math.abs(Math.round(native.height * scale) - monitor.size.height) <= 2
  ));
}

function displayFromMonitor(monitor: Monitor, native: NativeDisplayInfo | undefined, index: number, primary: Monitor | null): DisplayInfo {
  const width = monitor.size.width;
  const height = monitor.size.height;
  const name = monitor.name || native?.name || `Display ${index + 1}`;
  const friendlyName = native?.friendlyName || name;
  const isPrimary = Boolean(native?.isPrimary)
    || (primary?.name && monitor.name ? primary.name === monitor.name : index === 0);

  return {
    id: stableDisplayId(native, monitor, index),
    name,
    friendlyName,
    width,
    height,
    refreshHz: native?.refreshHz ?? null,
    x: monitor.position.x,
    y: monitor.position.y,
    scaleFactor: monitor.scaleFactor,
    nativeX: native?.logicalX,
    nativeY: native?.logicalY,
    nativeWidth: native?.logicalWidth,
    nativeHeight: native?.logicalHeight,
    isPrimary: Boolean(isPrimary),
    connected: true,
  };
}

function displayFromNative(native: NativeDisplayInfo, index: number): DisplayInfo {
  const name = native.name || `Display ${index + 1}`;
  return {
    id: stableNativeDisplayId(native, index),
    name,
    friendlyName: native.friendlyName || name,
    width: native.width,
    height: native.height,
    refreshHz: native.refreshHz,
    x: native.x,
    y: native.y,
    scaleFactor: native.scaleFactor,
    nativeX: native.logicalX,
    nativeY: native.logicalY,
    nativeWidth: native.logicalWidth,
    nativeHeight: native.logicalHeight,
    isPrimary: native.isPrimary,
    connected: true,
  };
}

export function discoverDisplays(): Promise<DisplayInfo[]> {
  if (displayDiscoveryInFlight) return displayDiscoveryInFlight;

  displayDiscoveryInFlight = (async () => {
    const native = await invoke<NativeDisplayInfo[]>("list_display_info").catch(() => []);

    // Linux uses the native topology as the source of truth. Avoid starting
    // two additional window-plugin requests on every display poll.
    if (typeof navigator !== "undefined" && /linux/i.test(navigator.userAgent) && native.length > 0) {
      return native.map(displayFromNative);
    }

    const [monitors, primary] = await Promise.all([
      availableMonitors().catch(() => []),
      primaryMonitor().catch(() => null),
    ]);
    return monitors.map((monitor, index) => {
      const match = native.find((candidate) => nativeMatch(candidate, monitor));
      return displayFromMonitor(monitor, match, index, primary);
    });
  })().finally(() => {
    displayDiscoveryInFlight = null;
  });

  return displayDiscoveryInFlight;
}

export function snapshotProjectorState(): ProjectorOutputSnapshot {
  lastSnapshot = makeSnapshot();
  return lastSnapshot;
}

export function publishProjectorSnapshot(snapshot = snapshotProjectorState()): Promise<void> {
  lastSnapshot = snapshot.revision === undefined ? { ...snapshot, revision: ++lastPublishedRevision } : snapshot;
  pendingSnapshot = lastSnapshot;
  // Keep the broadcast for compatibility with older output windows, but also
  // address the managed window directly. A WebKit process can reconnect after
  // a media error and miss a global event; targeted delivery prevents the
  // projector from staying on the previous scripture while the operator view
  // has already switched to a song.
  const promise = new Promise<void>((resolve) => publishWaiters.push(resolve));
  if (!publishScheduled) {
    publishScheduled = true;
    publishChain = publishChain.then(async () => {
      while (pendingSnapshot) {
        const outgoing = pendingSnapshot;
        pendingSnapshot = null;
        postProjectorChannelMessage({ type: "state", snapshot: outgoing });
      }
      publishScheduled = false;
      const waiters = publishWaiters;
      publishWaiters = [];
      waiters.forEach((resolve) => resolve());
    }, async () => {
      publishScheduled = false;
      const waiters = publishWaiters;
      publishWaiters = [];
      waiters.forEach((resolve) => resolve());
    });
  }
  return promise;
}

export async function startProjectorOutputBridge(): Promise<() => void> {
  const unsubscribe = subscribeProjectorChannel((message) => {
    if (message.type === "ready") {
      void publishProjectorSnapshot();
    } else if (message.type === "ack") {
      lastAcknowledgedRevision = Math.max(lastAcknowledgedRevision, message.revision);
    }
  });
  // Tauri/WebKit can miss a state event while the output webview is starting
  // or recovering from a media error. Repeat the latest snapshot while the
  // output is open; stop as soon as the output confirms receipt.
  const retry = window.setInterval(() => {
    const status = useProjectorStore.getState().outputStatus;
    if ((status === "ready" || status === "connected") && (lastSnapshot.revision ?? 0) > lastAcknowledgedRevision) {
      return publishProjectorSnapshot(lastSnapshot);
    }
    return undefined;
  }, 2000);
  return () => {
    window.clearInterval(retry);
    unsubscribe();
  };
}

async function getOutputWindow() {
  return WebviewWindow.getByLabel(PROJECTOR_OUTPUT_LABEL);
}

function displayFingerprint(display: DisplayInfo) {
  return `${display.id}:${display.x}:${display.y}:${display.width}:${display.height}:${display.scaleFactor}`;
}

async function positionOutputWindow(display: DisplayInfo) {
  await invoke<boolean>("place_projector_window", {
    x: display.x,
    y: display.y,
    width: display.width,
    height: display.height,
    scaleFactor: display.scaleFactor,
    nativeX: display.nativeX ?? null,
    nativeY: display.nativeY ?? null,
    nativeWidth: display.nativeWidth ?? null,
    nativeHeight: display.nativeHeight ?? null,
  });
}

async function performOpenProjectorOutput(display: DisplayInfo | null): Promise<void> {
  if (!display) {
    useProjectorStore.getState().setOutputStatus("error");
    return;
  }

  const store = useProjectorStore.getState();
  const wasConnected = store.outputStatus === "connected";
  store.selectDisplay(display.id);
  store.setOutputStatus("ready");
  const fingerprint = displayFingerprint(display);

  try {
    let outputWindow = await getOutputWindow();
    if (!outputWindow) {
      const outputUrl = new URL(window.location.href);
      outputUrl.searchParams.set("window", "projector");
      outputWindow = new WebviewWindow(PROJECTOR_OUTPUT_LABEL, {
        url: outputUrl.toString(),
        title: "SermonSync Projector Output",
        decorations: false,
        resizable: false,
        visible: false,
        skipTaskbar: true,
        focus: false,
        x: display.x,
        y: display.y,
        width: display.width,
        height: display.height,
      });

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (error?: unknown) => {
          if (settled) return;
          settled = true;
          if (error) reject(error);
          else resolve();
        };
        void outputWindow?.once("tauri://created", () => finish());
        void outputWindow?.once("tauri://error", (event) => finish(event.payload));
        window.setTimeout(() => finish(new Error("Timed out creating projector output window")), 10000);
      });
    }

    if (lastAppliedDisplayFingerprint === fingerprint && wasConnected) {
      await publishProjectorSnapshot();
      await outputWindow.show();
      store.setOutputStatus("connected");
      return;
    }

    await positionOutputWindow(display);
    await publishProjectorSnapshot();
    await outputWindow.show();
    lastAppliedDisplayFingerprint = fingerprint;
    store.setOutputStatus("connected");
  } catch (error) {
    lastAppliedDisplayFingerprint = null;
    store.setOutputStatus("error");
    throw error;
  }
}

function enqueueOutputOperation(operation: () => Promise<void>): Promise<void> {
  const pending = outputOperation.then(operation, operation);
  outputOperation = pending.catch(() => undefined);
  return pending;
}

export function openProjectorOutput(display = selectedDisplay()): Promise<void> {
  return enqueueOutputOperation(() => performOpenProjectorOutput(display));
}

export function hideProjectorOutput(): Promise<void> {
  return enqueueOutputOperation(async () => {
    const outputWindow = await getOutputWindow();
    if (!outputWindow) return;
    await outputWindow.hide().catch(() => undefined);
  });
}

export function closeProjectorOutput(): Promise<void> {
  return enqueueOutputOperation(async () => {
    const outputWindow = await getOutputWindow();
    if (outputWindow) await outputWindow.close().catch(() => undefined);
    lastAppliedDisplayFingerprint = null;
    useProjectorStore.getState().setOutputStatus("closed");
  });
}

export function selectedDisplay() {
  const state = useProjectorStore.getState();
  return state.availableDisplays.find((display) => display.id === state.selectedDisplayId) ?? null;
}

export function isProjectorOutputWindow() {
  return typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("window") === "projector";
}
