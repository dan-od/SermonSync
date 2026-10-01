import type { Song, SongSlide } from "../../../stores/songStore";
import type { ProjectorSlide } from "../../../types/state";

// Helper to map a song slide to a ProjectorSlide
export function toSongProjectorSlide(song: Song, slide: SongSlide, index: number): ProjectorSlide {
  return {
    reference: {
      book: song.title,
      chapter: 1,
      verse: index + 1,
    },
    text: slide.text,
    version: "SONG",
  };
}
