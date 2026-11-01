import { useEffect, useRef, useState } from "react";

export function AudioDeviceSelector({
  inputName,
  inputDevices,
  onInputNameChange,
  inputChannel,
  inputChannelCount,
  onInputChannelChange,
  activeInput,
}: {
  inputName: string;
  inputDevices: string[];
  onInputNameChange?: (inputName: string) => void;
  inputChannel: number;
  inputChannelCount: number;
  onInputChannelChange?: (channel: number) => void;
  activeInput: boolean;
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const channelDropdownRef = useRef<HTMLDivElement>(null);
  const [isInputMenuOpen, setIsInputMenuOpen] = useState(false);
  const [isChannelMenuOpen, setIsChannelMenuOpen] = useState(false);
  const [hoveredInputDevice, setHoveredInputDevice] = useState<string | null>(null);

  useEffect(() => {
    if (!isInputMenuOpen && !isChannelMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!dropdownRef.current?.contains(target)) {
        setIsInputMenuOpen(false);
      }
      if (!channelDropdownRef.current?.contains(target)) {
        setIsChannelMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isChannelMenuOpen, isInputMenuOpen]);

  return (
    <>
      <div ref={dropdownRef} style={{ position: "relative", minWidth: 0, flex: "0 1 172px" }}>
        <button
          type="button"
          className="ss-compact-trigger"
          onClick={() => setIsInputMenuOpen((current) => !current)}
          aria-haspopup="listbox"
          aria-expanded={isInputMenuOpen}
          style={{
            width: "100%",
            minWidth: 0,
            height: "25px",
            boxSizing: "border-box",
            border: "none",
            borderRadius: "4px",
            background: "var(--bg-elevated)",
            color: "var(--fg-base)",
            fontFamily: "var(--font-sans)",
            fontSize: "12px",
            lineHeight: 1,
            padding: "0 23px 0 8px",
            cursor: "pointer",
            textAlign: "left",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            position: "relative",
          }}
        >
          {inputName}
          <span style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", color: "var(--fg-subtle)" }}>⌄</span>
        </button>
        {isInputMenuOpen ? (
          <div
            role="listbox"
            className="ss-compact-menu"
            style={{
              position: "absolute",
              left: 0,
              bottom: "calc(100% + 6px)",
              zIndex: 20,
              width: "220px",
              border: "none",
              borderRadius: "5px",
              background: "var(--bg-elevated)",
              boxShadow: "var(--shadow-md)",
              padding: "4px",
              boxSizing: "border-box",
              maxHeight: "min(320px, calc(100vh - 44px))",
              overflowY: "auto",
              overflowX: "hidden",
              overscrollBehaviorY: "contain",
              scrollbarWidth: "thin",
              scrollbarColor: "var(--border-base) transparent",
            }}
          >
            {inputDevices.map((device) => {
              const selected = device === inputName;

              return (
                <button
                  key={device}
                  type="button"
                  role="option"
                  className="ss-compact-menu-item"
                  aria-selected={selected}
                  onClick={() => {
                    onInputNameChange?.(device);
                    setIsInputMenuOpen(false);
                    setHoveredInputDevice(null);
                  }}
                  onMouseEnter={() => setHoveredInputDevice(device)}
                  onMouseLeave={() => setHoveredInputDevice((current) => current === device ? null : current)}
                  onFocus={() => setHoveredInputDevice(device)}
                  onBlur={() => setHoveredInputDevice((current) => current === device ? null : current)}
                  style={{
                    width: "100%",
                    height: "25px",
                    minHeight: "25px",
                    boxSizing: "border-box",
                    border: "none",
                    borderRadius: "3px",
                    background: selected || hoveredInputDevice === device ? "var(--color-primary-muted)" : "transparent",
                    color: selected || hoveredInputDevice === device ? "var(--fg-base)" : "var(--fg-muted)",
                    fontFamily: "var(--font-sans)",
                    fontSize: "12px",
                    padding: "0 8px",
                    cursor: "pointer",
                    textAlign: "left",
                    overflowWrap: "anywhere",
                  }}
                >
                  {device}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      <div ref={channelDropdownRef} style={{ position: "relative", flex: "0 0 52px" }}>
        <button
          type="button"
          className="ss-compact-trigger"
          onClick={() => setIsChannelMenuOpen((current) => !current)}
          disabled={!activeInput}
          aria-label="Input channel"
          aria-haspopup="listbox"
          aria-expanded={isChannelMenuOpen}
          style={{
            width: "100%",
            height: "25px",
            minHeight: "25px",
            boxSizing: "border-box",
            border: "none",
            borderRadius: "4px",
            background: "var(--bg-elevated)",
            color: activeInput ? "var(--fg-base)" : "var(--fg-subtle)",
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            lineHeight: 1,
            padding: "0 16px 0 8px",
            cursor: activeInput ? "pointer" : "not-allowed",
            textAlign: "left",
            position: "relative",
          }}
          title="Input channel"
        >
          CH {inputChannel}
          <span style={{ position: "absolute", right: "5px", top: "50%", transform: "translateY(-50%)", color: "var(--fg-subtle)" }}>⌄</span>
        </button>
        {isChannelMenuOpen ? (
          <div
            role="listbox"
            aria-label="Input channel"
            style={{
              position: "absolute",
              left: 0,
              bottom: "calc(100% + 6px)",
              zIndex: 20,
              width: "72px",
              border: "none",
              borderRadius: "5px",
              background: "var(--bg-elevated)",
              boxShadow: "var(--shadow-md)",
              padding: "4px",
            }}
          >
            {Array.from({ length: Math.max(1, inputChannelCount) }, (_, index) => index + 1).map((channel) => {
              const selected = channel === inputChannel;

              return (
                <button
                  key={channel}
                  type="button"
                  role="option"
                  className="ss-compact-menu-item"
                  aria-selected={selected}
                  onClick={() => {
                    onInputChannelChange?.(channel);
                    setIsChannelMenuOpen(false);
                  }}
                  style={{
                    width: "100%",
                    height: "25px",
                    minHeight: "25px",
                    boxSizing: "border-box",
                    border: "none",
                    borderRadius: "3px",
                    background: selected ? "var(--color-primary-muted)" : "transparent",
                    color: selected ? "var(--fg-base)" : "var(--fg-muted)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    padding: "0 8px",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  CH {channel}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </>
  );
}
