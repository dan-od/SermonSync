export const DEFAULT_INPUT_DEVICES = ["Default Device", "Built-in Microphone", "USB Audio Interface"];

export const MODEL_PROVIDER_COLORS: Record<string, string> = {
  groq: "#f97316",
  openai: "#10a37f",
  anthropic: "#d97757",
  gemini: "#4285f4",
};

export function formatUptime(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (value: number) => value.toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`;
}

export function formatLatency(latencyMs: number) {
  return `${Math.max(0, Math.round(latencyMs))}ms`;
}

export const STATUS_BAR_CSS = `
        @keyframes ssLivePing {
          0% { box-shadow: 0 0 0 0 rgba(18, 214, 146, 0.5); }
          70% { box-shadow: 0 0 0 6px rgba(18, 214, 146, 0); }
          100% { box-shadow: 0 0 0 0 rgba(18, 214, 146, 0); }
        }

        .ss-vad-range {
          appearance: none;
          width: 84px;
          height: 16px;
          background: transparent;
          cursor: ew-resize;
        }

        .ss-vad-range::-webkit-slider-runnable-track {
          height: 4px;
          border-radius: 999px;
          background: linear-gradient(90deg, var(--color-primary) var(--ss-vad-percent), var(--border-base) var(--ss-vad-percent));
        }

        .ss-vad-range::-webkit-slider-thumb {
          appearance: none;
          width: 12px;
          height: 12px;
          margin-top: -4px;
          border-radius: 50%;
          border: 1px solid var(--border-base);
          background: var(--bg-surface);
          box-shadow: 0 0 10px rgba(123, 47, 247, 0.55);
        }

        .ss-vad-range::-moz-range-track {
          height: 4px;
          border-radius: 999px;
          background: var(--border-base);
        }

        .ss-vad-range::-moz-range-progress {
          height: 4px;
          border-radius: 999px;
          background: var(--color-primary);
        }

        .ss-vad-range::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          border: 1px solid var(--border-base);
          background: var(--bg-surface);
          box-shadow: 0 0 10px rgba(123, 47, 247, 0.55);
        }
      `;
