import type { ProjectorSlide } from "../../types/state";
import type { BibleVerse } from "./types";

const BIBLE_API_BASE = "http://127.0.0.1:8000";

// ─── Scriptures tab ───────────────────────────────────────────────────────────

export function referenceLabel(slide: ProjectorSlide) {
  return `${slide.reference.book} ${slide.reference.chapter}:${slide.reference.verse}`;
}

export function toProjectorSlide(book: string, chapter: number, verse: BibleVerse, version: string): ProjectorSlide {
  return {
    reference: { book, chapter, verse: verse.verse },
    text: verse.text,
    version,
  };
}

export async function fetchBibleJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${BIBLE_API_BASE}${path}`, { signal });
  if (!response.ok) {
    let detail = `Bible API error (${response.status})`;
    try {
      const body = await response.json() as { detail?: unknown };
      if (typeof body.detail === "string" && body.detail) {
        detail = body.detail;
      }
    } catch {
      // body is not JSON — keep the status-code message
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

export function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}
