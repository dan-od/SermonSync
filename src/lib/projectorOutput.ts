/**
 * SS-036: congregation output window plumbing.
 *
 * The operator window ("main") owns all state and pushes snapshots to the
 * projector window ("projector"), which renders only the LIVE stage. This
 * module holds the shared types, the Rust command wrappers and the event
 * helpers both windows use.
 */
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen, type UnlistenFn } from "@tauri-apps/api/event";

import type { OverlayMode, ProjectorSlide, TransitionsConfig, VerseTheme } from "../types/state";

export const PROJECTOR_WINDOW_LABEL = "projector";
export const OPERATOR_WINDOW_LABEL = "main";

/** main → projector: the full render snapshot. */
export const PROJECTOR_STATE_EVENT = "projector://state";
/** projector → main: listener attached, send me a snapshot. */
export const PROJECTOR_READY_EVENT = "projector://ready";
/** Rust → main: the projector window was destroyed, whoever closed it. */
export const PROJECTOR_CLOSED_EVENT = "projector://closed";

export interface DisplayInfo {
  /** `name@x,y` */
  id: string;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  scaleFactor: number;
  isPrimary: boolean;
  isOperatorDisplay: boolean;
}

export interface ProjectorWindowState {
  open: boolean;
  windowed: boolean;
  display: DisplayInfo | null;
}

export interface ProjectorVideoControl {
  playing: boolean;
  loop: boolean;
}

export type ProjectorFeedOverride = "live" | "logo" | "black" | "clear";

export interface ProjectorSnapshot {
  liveSlide: ProjectorSlide | null;
  feedOverride: ProjectorFeedOverride;
  overlayMode: OverlayMode;
  theme: VerseTheme;
  transitions: TransitionsConfig;
  video: ProjectorVideoControl;
  /** Bumped by main after a template save lands on disk; the projector reloads. */
  templatesRevision: number;
}

interface TauriInternals {
  metadata?: { currentWindow?: { label?: string } };
}

function tauriInternals(): TauriInternals | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;
}

export function isTauriRuntime(): boolean {
  return tauriInternals() !== undefined;
}

/** Synchronous so main.tsx can pick the root component before first render. */
export function isProjectorWindow(): boolean {
  try {
    return tauriInternals()?.metadata?.currentWindow?.label === PROJECTOR_WINDOW_LABEL;
  } catch {
    return false;
  }
}

/** The display name encoded in an id (`name@x,y`). Names may contain `@`. */
export function displayNameFromId(id: string): string {
  const at = id.lastIndexOf("@");
  return at === -1 ? id : id.slice(0, at);
}

/**
 * Mirrors the Rust resolver: exact id first, then a unique name match that is
 * not the operator's own screen (a display that comes back at new coordinates
 * gets a new id).
 */
export function resolveDisplay(displays: DisplayInfo[], id: string | null): DisplayInfo | null {
  if (!id) return null;
  const exact = displays.find((display) => display.id === id);
  if (exact) return exact;
  const name = displayNameFromId(id);
  const matches = displays.filter((display) => display.name === name && !display.isOperatorDisplay);
  return matches.length === 1 ? matches[0] : null;
}

export function listDisplays(): Promise<DisplayInfo[]> {
  return invoke<DisplayInfo[]>("list_displays");
}

export function openProjectorWindow(displayId: string | null, windowed: boolean): Promise<ProjectorWindowState> {
  return invoke<ProjectorWindowState>("open_projector_window", { displayId, windowed });
}

export function closeProjectorWindow(): Promise<void> {
  return invoke<void>("close_projector_window");
}

export function emitProjectorState(snapshot: ProjectorSnapshot): Promise<void> {
  return emitTo(PROJECTOR_WINDOW_LABEL, PROJECTOR_STATE_EVENT, snapshot);
}

export function onProjectorState(handler: (snapshot: ProjectorSnapshot) => void): Promise<UnlistenFn> {
  return listen<ProjectorSnapshot>(PROJECTOR_STATE_EVENT, (event) => handler(event.payload));
}

export function announceProjectorReady(): Promise<void> {
  return emitTo(OPERATOR_WINDOW_LABEL, PROJECTOR_READY_EVENT);
}

export function onProjectorReady(handler: () => void): Promise<UnlistenFn> {
  return listen(PROJECTOR_READY_EVENT, () => handler());
}

export function onProjectorClosed(handler: () => void): Promise<UnlistenFn> {
  return listen(PROJECTOR_CLOSED_EVENT, () => handler());
}

export function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
