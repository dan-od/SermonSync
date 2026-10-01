/** Scoped stylesheet for the status bar (live ping keyframes + VAD slider). */
export const statusBarCss = `
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
