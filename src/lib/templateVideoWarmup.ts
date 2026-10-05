import type { TemplateCanvasTheme, TemplateThemeDocument } from "../types/templates";
import { projectionScene } from "./projectionScene";
import { managedVideoUrl } from "./videoImport";

const warmVideos = new Map<string, { video: HTMLVideoElement; stop: () => void }>();
const attemptedSources = new Set<string>();
let warmHost: HTMLDivElement | null = null;

function makeRoom(): void {
  if (warmVideos.size < 2) return;
  const oldest = warmVideos.entries().next().value;
  if (!oldest) return;
  const [url, entry] = oldest;
  warmVideos.delete(url);
  attemptedSources.delete(url);
  entry.stop();
  try {
    entry.video.pause();
    entry.video.removeAttribute("src");
  } catch { /* The webview may already have released this node. */ }
  entry.video.remove();
}

export function preparedTemplateVideoUrl(source: string): string | null {
  const managed = managedVideoUrl(source);
  if (managed) return managed;
  const normalized = source.replaceAll("\\", "/");
  const match = normalized.match(/\/video-cache\/([0-9a-f]{16}\.mp4)$/);
  return match ? `http://127.0.0.1:8000/api/template-video/${match[1]}` : null;
}

function ensureWarmHost(): HTMLDivElement {
  if (warmHost?.isConnected) return warmHost;
  warmHost = document.createElement("div");
  warmHost.setAttribute("aria-hidden", "true");
  warmHost.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
  document.body.appendChild(warmHost);
  return warmHost;
}

function warmVideo(source: string): void {
  const url = preparedTemplateVideoUrl(source);
  if (!url || attemptedSources.has(url) || typeof document === "undefined") return;
  makeRoom();
  attemptedSources.add(url);

  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  const onError = () => {
    if (warmVideos.get(url)?.video !== video) return;
    warmVideos.delete(url);
    stop();
    try { video.pause(); video.removeAttribute("src"); } catch { /* The failed node may already be invalid. */ }
    video.remove();
  };
  const stop = () => {
    video.removeEventListener("error", onError);
  };
  warmVideos.set(url, { video, stop });
  video.addEventListener("error", onError);
  ensureWarmHost().appendChild(video);
  video.src = url;
}

export function warmPreparedVideo(source: string): void {
  warmVideo(source);
}

function backgroundVideo(template: TemplateCanvasTheme): string | null {
  const media = template.studioDocument
    ? template.studioDocument.backgroundMode === "media" ? template.studioDocument.backgroundMedia : null
    : template.scene.backgroundMedia;
  return media?.type === "video" ? media.src : null;
}

/** Prepare the selected template videos while the operator is choosing the first slide. */
export function warmDefaultTemplateVideos(document: Pick<TemplateThemeDocument, "templates" | "defaults">): void {
  for (const category of ["scriptures", "songs"] as const) {
    for (const layout of ["widescreen", "lower-third", "split-screen"] as const) {
      const selectedId = document.defaults[category][layout];
      const template = document.templates.find((entry) => entry.id === selectedId && entry.category === category && entry.layout === layout);
      if (template) projectionScene(template);
      const source = template && backgroundVideo(template);
      if (source) warmVideo(source);
    }
  }
}

/** A visible player takes ownership so its loaded first frame and decoder survive the first push. */
export function takeWarmTemplateVideo(url: string): HTMLVideoElement | null {
  const entry = warmVideos.get(url);
  if (!entry) return null;
  warmVideos.delete(url);
  entry.stop();
  if (entry.video.error) {
    try {
      entry.video.removeAttribute("src");
    } catch { /* The visible player will create a fresh node. */ }
    entry.video.remove();
    return null;
  }
  return entry.video;
}

/** Retain a working stream so a remount can reuse its decoder and first frame. */
export function returnWarmTemplateVideo(url: string, video: HTMLVideoElement): boolean {
  if (!/^http:\/\/127\.0\.0\.1:8000\/api\/(?:template-video\/[0-9a-f]{16}\.mp4|media-video\/[0-9a-f]{64}-sermonsync-playback-v1\/playback\.mp4)$/.test(url) || warmVideos.has(url) || video.error || typeof document === "undefined") return false;
  makeRoom();
  attemptedSources.add(url);
  ensureWarmHost().appendChild(video);
  warmVideos.set(url, { video, stop: () => undefined });
  return true;
}
