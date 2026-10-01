export type WorkspaceTab = "suggestions" | "bible" | "notes" | "database";

export type LibraryScheduleItem = {
  id: string;
  kind: "scriptures" | "songs";
  value: string;
  /** present when this record represents a whole cued song sequence rather than a single slide */
  cueSlides?: { label: string; text: string }[];
};
