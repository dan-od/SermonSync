import { type ProjectorSlide } from "../types/state";

export type LibraryScheduleItem = {
  id: string;
  kind: "scriptures" | "songs";
  value: string;
  sourceSongId?: string;
  slide?: ProjectorSlide;
  /** present when this record represents a whole cued song sequence rather than a single slide */
  cueSlides?: { label: string; text: string }[];
};
