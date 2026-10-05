import { useRef, type CSSProperties, type PointerEvent } from "react";

import type { TemplateBackgroundMedia } from "../../types/templates";
import { snapCameraFrame, type CameraEditMode, type CameraFrameHandle, type CameraSnapGuides } from "../../lib/cameraFrame";

const positions: Record<Exclude<CameraFrameHandle, "move">, CSSProperties> = {
  n: { left: "50%", top: 0 }, s: { left: "50%", top: "100%" },
  e: { left: "100%", top: "50%" }, w: { left: 0, top: "50%" },
  ne: { left: "100%", top: 0 }, nw: { left: 0, top: 0 },
  se: { left: "100%", top: "100%" }, sw: { left: 0, top: "100%" },
};

export function CameraFrameControls({ media, mode, getSnapTargets, onStart, onChange, onGuides, onEnd }: {
  media: TemplateBackgroundMedia;
  mode: Exclude<CameraEditMode, "off">;
  getSnapTargets: () => CameraSnapGuides;
  onStart: () => void;
  onChange: (media: TemplateBackgroundMedia) => void;
  onGuides: (guides: CameraSnapGuides) => void;
  onEnd: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ handle: CameraFrameHandle; x: number; y: number; media: TemplateBackgroundMedia; targets: CameraSnapGuides } | null>(null);
  const begin = (event: PointerEvent<HTMLElement>, handle: CameraFrameHandle) => {
    if (event.button !== 0 || !stageRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { handle, x: event.clientX, y: event.clientY, media, targets: getSnapTargets() };
    event.currentTarget.setPointerCapture(event.pointerId);
    onStart();
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    event.stopPropagation();
    const drag = dragRef.current;
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!drag || !bounds?.width || !bounds.height) return;
    const dx = (event.clientX - drag.x) / bounds.width * 100;
    const dy = (event.clientY - drag.y) / bounds.height * 100;
    const snapped = snapCameraFrame(drag.media, drag.handle, mode, dx, dy, drag.targets, { width: bounds.width, height: bounds.height });
    onChange(snapped.media);
    onGuides(snapped.guides);
  };
  const end = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    onGuides({ vertical: [], horizontal: [] });
    onEnd();
  };

  return <div ref={stageRef} style={{ position: "absolute", inset: 0, zIndex: 4, pointerEvents: "none" }}>
    <div
      aria-label={mode === "crop" ? "Camera crop frame" : "Camera frame"}
      style={{ position: "absolute", left: `${media.x}%`, top: `${media.y}%`, width: `${media.width}%`, height: `${media.height}%`, boxSizing: "border-box", border: `2px ${mode === "crop" ? "dashed" : "solid"} var(--color-primary)`, boxShadow: "0 0 0 1px #fff", pointerEvents: "none", touchAction: "none" }}
    >
      {mode === "frame" ? ([
        { name: "top", style: { left: 6, right: 6, top: -5, height: 10 } },
        { name: "bottom", style: { left: 6, right: 6, bottom: -5, height: 10 } },
        { name: "left", style: { top: 6, bottom: 6, left: -5, width: 10 } },
        { name: "right", style: { top: 6, bottom: 6, right: -5, width: 10 } },
      ] as const).map(({ name, style }) => <button
        key={name}
        type="button"
        aria-label={`Move camera frame from ${name} edge`}
        onPointerDown={(event) => begin(event, "move")}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        style={{ position: "absolute", ...style, border: 0, padding: 0, background: "transparent", pointerEvents: "auto", touchAction: "none", cursor: "move" }}
      />) : null}
      {(Object.keys(positions) as Exclude<CameraFrameHandle, "move">[]).map((handle) => <button
        key={handle}
        type="button"
        aria-label={`${mode === "crop" ? "Crop" : "Resize"} camera ${handle}`}
        onPointerDown={(event) => begin(event, handle)}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        style={{ position: "absolute", ...positions[handle], width: 11, height: 11, padding: 0, border: "1px solid #fff", borderRadius: 2, background: "var(--color-primary)", transform: "translate(-50%, -50%)", pointerEvents: "auto", touchAction: "none", cursor: `${handle}-resize` }}
      />)}
    </div>
  </div>;
}
