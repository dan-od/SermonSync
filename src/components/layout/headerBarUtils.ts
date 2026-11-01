export type HeaderMenuName = "File" | "Edit" | "View" | "Help";
export type HeaderMenuEntry =
  | { kind: "separator" }
  | { kind: "action"; label: string; shortcut?: string; checked?: boolean; onSelect: () => void };

export function formatElapsed(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hh = String(Math.floor(safeSeconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((safeSeconds % 3600) / 60)).padStart(2, "0");
  const ss = String(safeSeconds % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
