export type DropPosition = "before" | "after";

export function reorderItems<T extends { id: string }>(
  items: T[],
  sourceId: string,
  targetId: string,
  position: DropPosition,
): T[] {
  if (sourceId === targetId) return items;

  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return items;

  const next = [...items];
  const [source] = next.splice(sourceIndex, 1);
  const remainingTargetIndex = next.findIndex((item) => item.id === targetId);
  next.splice(remainingTargetIndex + (position === "after" ? 1 : 0), 0, source);
  return next;
}