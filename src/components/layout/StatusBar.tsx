import { type CSSProperties, useEffect, useRef, useState } from "react";

export interface StatusBarProps {
  inputName: string;
  inputDevices?: string[];
  onInputNameChange?: (inputName: string) => void;
  vadPercent: number;
  onVadPercentChange?: (vadPercent: number) => void;
  sampleRateLabel: string;
  engineVersion: string;
  locationLabel: string;
}

const DEFAULT_INPUT_DEVICES = ["Default Device", "Built-in Microphone", "USB Audio Interface"];

export function StatusBar({
  inputName,
  inputDevices = DEFAULT_INPUT_DEVICES,
  onInputNameChange,
  vadPercent,
  onVadPercentChange,
  sampleRateLabel,
  engineVersion,
  locationLabel,
}: StatusBarProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isInputMenuOpen, setIsInputMenuOpen] = useState(false);
  const clampedVad = Math.min(100, Math.max(0, vadPercent));
  const meterBars = [4, 8, 13, 18, 22, 16, 11, 7];
  const activeInput = Boolean(inputName);

  useEffect(() => {
    if (!isInputMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setIsInputMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isInputMenuOpen]);

  return (
    <footer
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "0 10px",
        height: "30px",
        background: "#070d1c",
        borderTop: "1px solid #1a2747",
        fontFamily: "var(--font-mono)",
        fontSize: "11px",
        color: "#9aabcf",
        overflow: "visible",
        position: "relative",
        zIndex: 30,
      }}
    >
      <style>{`
        @keyframes ssAudioPulse {
          0%, 100% { transform: scaleY(0.45); opacity: 0.45; }
          35% { transform: scaleY(1); opacity: 1; }
          65% { transform: scaleY(0.72); opacity: 0.76; }
        }

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
          background: linear-gradient(90deg, #7b2ff7 var(--ss-vad-percent), #25355d var(--ss-vad-percent));
        }

        .ss-vad-range::-webkit-slider-thumb {
          appearance: none;
          width: 12px;
          height: 12px;
          margin-top: -4px;
          border-radius: 50%;
          border: 1px solid #dbe7ff;
          background: #ffffff;
          box-shadow: 0 0 10px rgba(123, 47, 247, 0.55);
        }

        .ss-vad-range::-moz-range-track {
          height: 4px;
          border-radius: 999px;
          background: #25355d;
        }

        .ss-vad-range::-moz-range-progress {
          height: 4px;
          border-radius: 999px;
          background: #7b2ff7;
        }

        .ss-vad-range::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          border: 1px solid #dbe7ff;
          background: #ffffff;
          box-shadow: 0 0 10px rgba(123, 47, 247, 0.55);
        }
      `}</style>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: "0 0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            background: "#0d2030",
            color: "#7df0c3",
            border: "1px solid #1f4357",
            borderRadius: "4px",
            padding: "2px 7px",
            lineHeight: 1,
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "#12d692",
              animation: activeInput ? "ssLivePing 1.4s ease-out infinite" : "none",
            }}
          />
          <span style={{ fontWeight: 700, letterSpacing: "0.04em" }}>LIVE</span>
        </div>
        <span style={{ color: "#6b7fa8" }}>DB</span>
        <span style={{ color: "#c7d5f3" }}>SQLite</span>
      </div>

      <div style={{ width: "1px", alignSelf: "stretch", background: "#1c2a4b" }} />

      <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: "1 1 auto" }}>
        <span style={{ color: "#6b7fa8", letterSpacing: "0.05em" }}>INPUT</span>
        <div ref={dropdownRef} style={{ position: "relative", minWidth: 0, flex: "0 1 172px" }}>
          <button
            type="button"
            onClick={() => setIsInputMenuOpen((current) => !current)}
            aria-haspopup="listbox"
            aria-expanded={isInputMenuOpen}
            style={{
              width: "100%",
              minWidth: 0,
              border: "none",
              borderRadius: "6px",
              background: "#0b1224",
              color: "#dce5fb",
              fontFamily: "var(--font-sans)",
              fontSize: "12px",
              lineHeight: 1,
              padding: "5px 23px 5px 8px",
              cursor: "pointer",
              textAlign: "left",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              position: "relative",
            }}
          >
            {inputName}
            <span style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", color: "#7f92bb" }}>⌄</span>
          </button>
          {isInputMenuOpen ? (
            <div
              role="listbox"
              style={{
                position: "absolute",
                left: 0,
                bottom: "calc(100% + 6px)",
                zIndex: 20,
                width: "220px",
                border: "none",
                borderRadius: "8px",
                background: "#0b1224",
                boxShadow: "0 14px 32px rgba(0, 0, 0, 0.42)",
                padding: "4px",
              }}
            >
              {inputDevices.map((device) => {
                const selected = device === inputName;

                return (
                  <button
                    key={device}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onInputNameChange?.(device);
                      setIsInputMenuOpen(false);
                    }}
                    style={{
                      width: "100%",
                      border: "none",
                      borderRadius: "6px",
                      background: selected ? "#17284f" : "transparent",
                      color: selected ? "#ffffff" : "#aebbdd",
                      fontFamily: "var(--font-sans)",
                      fontSize: "12px",
                      padding: "8px 9px",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    {device}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        <span style={{ color: "#40527d" }}>|</span>
        <span style={{ color: "#6b7fa8", letterSpacing: "0.05em" }}>VAD</span>
        <span style={{ color: "#dce5fb", minWidth: "34px" }}>{clampedVad}%</span>
        <input
          type="range"
          min={0}
          max={100}
          value={clampedVad}
          onChange={(event) => onVadPercentChange?.(Number(event.target.value))}
          aria-label="VAD threshold"
          className="ss-vad-range"
          style={{ "--ss-vad-percent": `${clampedVad}%` } as CSSProperties}
        />
        <div
          aria-label={activeInput ? "Live input audio level active" : "No active input audio level"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "2px",
            height: "22px",
            padding: "0 2px",
          }}
        >
          {meterBars.map((height, index) => (
            <span
              key={index}
              style={{
                width: "3px",
                height: `${height}px`,
                borderRadius: "999px",
                background: activeInput ? "linear-gradient(180deg, #b994ff, #7b2ff7)" : "#2b3d66",
                transformOrigin: "bottom",
                animation: activeInput ? `ssAudioPulse 780ms ease-in-out ${index * 70}ms infinite` : "none",
              }}
            />
          ))}
        </div>
      </div>

      <div style={{ width: "1px", alignSelf: "stretch", background: "#1c2a4b" }} />

      <div style={{ display: "flex", alignItems: "center", gap: "9px", minWidth: 0, flex: "0 1 auto" }}>
        <span style={{ color: "#7f92bb" }}>{sampleRateLabel}</span>
        <span
          style={{
            padding: "2px 6px",
            borderRadius: "4px",
            background: "#111f40",
            border: "none",
            color: "#c3d3f5",
            lineHeight: 1,
          }}
        >
          {engineVersion}
        </span>
        <span
          style={{
            maxWidth: "240px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "#6f82ab",
            fontFamily: "var(--font-sans)",
            fontSize: "12px",
          }}
        >
          {locationLabel}
        </span>
      </div>
    </footer>
  );
}
