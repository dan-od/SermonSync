export interface AudioPlaybackSettings {
  volume: number;
  trimStart: number;
  trimEnd: number | null;
  loop: boolean;
}

let audioElement: HTMLAudioElement | null = null;
let activeSource: string | null = null;
let activeOwner: "live" | "preview" | null = null;
let requestGeneration = 0;

export function getSharedAudioOwner(): "live" | "preview" | null {
  return activeOwner;
}

export function audioPlaybackErrorMessage(error: unknown, audio: HTMLAudioElement): string {
  const mediaError = audio.error;
  const reason = mediaError?.message || (error instanceof Error ? error.message : String(error ?? "Unknown media error"));
  const code = mediaError?.code;
  const hint = code === 4 ? "The audio source or format is unsupported." :
    code === 2 ? "The audio file could not be loaded from the local media server." :
    code === 3 ? "The audio file could not be decoded." :
    code === 1 ? "Loading was interrupted." :
    "Check that the audio file is available and the local media server is running.";
  return `${hint} ${reason}`;
}

export function getSharedAudioElement(): HTMLAudioElement {
  if (!audioElement) {
    audioElement = new Audio();
    audioElement.preload = "auto";
    audioElement.style.display = "none";
    document.body.appendChild(audioElement);
  }
  return audioElement;
}

export function startSharedAudioPlayback(source: string, settings: AudioPlaybackSettings, owner: "live" | "preview" = "preview"): Promise<boolean> {
  const audio = getSharedAudioElement();
  const generation = ++requestGeneration;
  activeOwner = owner;
  if (activeSource !== source) {
    if (activeSource !== null) audio.pause();
    audio.src = source;
    activeSource = source;
  }

  audio.volume = Math.max(0, Math.min(1, settings.volume));
  audio.muted = false;
  audio.loop = settings.loop && settings.trimEnd == null;

  if (audio.currentTime < settings.trimStart || (settings.trimEnd != null && audio.currentTime >= settings.trimEnd)) {
    const seekToTrimStart = () => {
      if (activeSource !== source) return;
      try { audio.currentTime = settings.trimStart; } catch { /* Metadata may still be loading. */ }
    };
    if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) seekToTrimStart();
    else audio.addEventListener("loadedmetadata", seekToTrimStart, { once: true });
  }

  return audio.play().then(() => generation === requestGeneration).catch((error: unknown) => {
    if (generation !== requestGeneration) return false;
    throw error;
  });
}

export function pauseSharedAudioPlayback(owner?: "live" | "preview"): void {
  if (owner && owner !== activeOwner) return;
  ++requestGeneration;
  audioElement?.pause();
  activeOwner = null;
}
