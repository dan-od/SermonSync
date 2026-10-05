import { invoke } from "@tauri-apps/api/core";

// Staging completes quickly so saving never waits for a full transcode.
const staging = new Map<string, Promise<string>>();

export function isStagedTemplateVideo(source: string): boolean {
  return /[\\/]video-cache[\\/][0-9a-f]{16}-source\.bin$/.test(source);
}

export function stageTemplateVideo(source: string): Promise<string> {
  if (!source.startsWith("data:")) return Promise.resolve(source);
  const existing = staging.get(source);
  if (existing) return existing;
  const request = invoke<string>("stage_template_video", { dataUrl: source });
  staging.set(source, request);
  void request.finally(() => staging.delete(source)).catch(() => undefined);
  return request;
}
