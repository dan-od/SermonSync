interface Point {
  x: number;
  y: number;
}

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Size {
  width: number;
  height: number;
}

/** Keep a pointer menu inside its visible panel, including at the right and bottom edges. */
export function contextMenuPosition(point: Point, size: Size, panel: Bounds, viewport: Bounds, inset = 8): Point {
  const left = Math.max(panel.left, viewport.left) + inset;
  const top = Math.max(panel.top, viewport.top) + inset;
  const right = Math.min(panel.right, viewport.right) - inset;
  const bottom = Math.min(panel.bottom, viewport.bottom) - inset;
  return {
    x: Math.max(left, Math.min(point.x, Math.max(left, right - size.width))),
    y: Math.max(top, Math.min(point.y, Math.max(top, bottom - size.height))),
  };
}
