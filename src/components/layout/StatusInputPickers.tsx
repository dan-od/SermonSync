import type { Dispatch, RefObject, SetStateAction } from "react";

export function InputDevicePicker({
  dropdownRef,
  inputName,
  inputDevices,
  onInputNameChange,
  isInputMenuOpen,
  setIsInputMenuOpen,
}: {
  dropdownRef: RefObject<HTMLDivElement | null>;
  inputName: string;
  inputDevices: string[];
  onInputNameChange?: (inputName: string) => void;
  isInputMenuOpen: boolean;
  setIsInputMenuOpen: Dispatch<SetStateAction<boolean>>;
}) {
  return (
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
          background: "var(--bg-elevated)",
          color: "var(--fg-base)",
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
        <span style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", color: "var(--fg-subtle)" }}>⌄</span>
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
            background: "var(--bg-elevated)",
            boxShadow: "var(--shadow-md)",
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
                  background: selected ? "var(--color-primary-muted)" : "transparent",
                  color: selected ? "var(--fg-base)" : "var(--fg-muted)",
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
  );
}

export function InputChannelPicker({
  channelDropdownRef,
  activeInput,
  inputChannel,
  inputChannelCount,
  onInputChannelChange,
  isChannelMenuOpen,
  setIsChannelMenuOpen,
}: {
  channelDropdownRef: RefObject<HTMLDivElement | null>;
  activeInput: boolean;
  inputChannel: number;
  inputChannelCount: number;
  onInputChannelChange?: (channel: number) => void;
  isChannelMenuOpen: boolean;
  setIsChannelMenuOpen: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <div ref={channelDropdownRef} style={{ position: "relative", flex: "0 0 52px" }}>
      <button
        type="button"
        onClick={() => setIsChannelMenuOpen((current) => !current)}
        disabled={!activeInput}
        aria-label="Input channel"
        aria-haspopup="listbox"
        aria-expanded={isChannelMenuOpen}
        style={{
          width: "100%",
          height: "24px",
          border: "none",
          borderRadius: "6px",
          background: "var(--bg-elevated)",
          color: activeInput ? "var(--fg-base)" : "var(--fg-subtle)",
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          lineHeight: 1,
          padding: "5px 16px 5px 6px",
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
            borderRadius: "8px",
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
                aria-selected={selected}
                onClick={() => {
                  onInputChannelChange?.(channel);
                  setIsChannelMenuOpen(false);
                }}
                style={{
                  width: "100%",
                  border: "none",
                  borderRadius: "6px",
                  background: selected ? "var(--color-primary-muted)" : "transparent",
                  color: selected ? "var(--fg-base)" : "var(--fg-muted)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  padding: "7px 6px",
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
  );
}
