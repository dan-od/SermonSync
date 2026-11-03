import type { useHeaderWindow } from "./useHeaderWindow";

export function HeaderWindowControls({ windowControls }: { windowControls: ReturnType<typeof useHeaderWindow>["windowControls"] }) {
  return (
    <div
      data-no-drag="true"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "2px",
        justifySelf: "end",
      }}
    >
      {windowControls.map((control) => (
        <button
          key={control.id}
          type="button"
          onClick={control.onClick}
          title={control.label}
          data-no-drag="true"
          className={`ss-header-win${control.tone === "danger" ? " ss-header-win--danger" : ""}`}
          style={{
            fontSize: control.id === "minimize" ? "12px" : "9px",
          }}
        >
          {control.glyph}
        </button>
      ))}
    </div>
  );
}
