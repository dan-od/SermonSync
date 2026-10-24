import { invoke } from "@tauri-apps/api/core";

export interface AudioAsset {
  id: string;
  path: string;
}

const managedAsset = /[\\/]media[\\/]audio[\\/]assets[\\/]([0-9a-f]{64}-sermonsync-audio-v1)[\\/]playback\.mp3$/i;
const MAX_CONCURRENT_IMPORTS = 3;
const pendingImports = new Map<string, Promise<AudioAsset>>();
const importQueue: Array<() => void> = [];
let activeImports = 0;

function startQueuedImports(): void {
  while (activeImports < MAX_CONCURRENT_IMPORTS && importQueue.length > 0) {
    activeImports += 1;
    importQueue.shift()?.();
  }
}

export function isManagedAudio(path: string): boolean {
  return managedAsset.test(path);
}

export function managedAudioUrl(path: string): string | null {
  const match = path.match(managedAsset);
  return match ? `http://127.0.0.1:8000/api/media-audio/${match[1]}/playback.mp3` : null;
}

export function importAudio(path: string): Promise<AudioAsset> {
  const existing = pendingImports.get(path);
  if (existing) return existing;
  const pending = new Promise<AudioAsset>((resolve, reject) => {
    importQueue.push(() => {
      void invoke<AudioAsset>("import_audio_asset", { path })
        .then(resolve, reject)
        .finally(() => {
          pendingImports.delete(path);
          activeImports -= 1;
          startQueuedImports();
        });
    });
  });
  pendingImports.set(path, pending);
  startQueuedImports();
  return pending;
}
