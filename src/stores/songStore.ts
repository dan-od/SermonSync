import { create } from "zustand";
import { getBrowserStorage } from "./persistStorage";

export interface SongSlide {
  label: string;
  text: string;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  slides: SongSlide[];
  createdAt?: number;
  updatedAt?: number;
}

const STORAGE_KEY = "sermonsync_songs";

function loadSongsFromStorage(): Song[] {
  try {
    const storage = getBrowserStorage();
    // getBrowserStorage always resolves to a synchronous backend (localStorage or
    // the no-op fallback), never the async branch zustand's StateStorage type allows.
    const raw = storage.getItem(STORAGE_KEY);
    if (typeof raw !== "string" || !raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Ignore invalid JSON
  }
  return [];
}

function saveSongsToStorage(songs: Song[]): void {
  try {
    const storage = getBrowserStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify(songs));
  } catch {
    // Ignore storage errors
  }
}

interface SongStore {
  songs: Song[];
  initialized: boolean;
  initialize: () => void;
  createSong: (songData: { title: string; artist?: string; slides?: SongSlide[] }) => Song;
  addSong: (songData: { title: string; artist?: string; slides?: SongSlide[] }) => Song;
  saveSong: (song: Song) => void;
  updateSong: (id: string, patch: Partial<Omit<Song, "id">>) => void;
  deleteSong: (id: string) => void;
  renameSong: (id: string, title: string, artist?: string) => void;
}

export const useSongStore = create<SongStore>((set, get) => ({
  songs: [],
  initialized: false,

  initialize: () => {
    if (get().initialized) return;
    const loaded = loadSongsFromStorage();
    set({ songs: loaded, initialized: true });
  },

  createSong: (songData) => {
    const now = Date.now();
    return {
      id: `song-${now}-${Math.random().toString(36).slice(2, 6)}`,
      title: songData.title.trim() || "New Song",
      artist: (songData.artist ?? "").trim() || "Unknown Artist",
      slides: songData.slides && songData.slides.length > 0
        ? songData.slides
        : [
            { label: "Verse 1", text: "Enter verse 1 lyrics here..." },
            { label: "Chorus", text: "Enter chorus lyrics here..." },
          ],
      createdAt: now,
      updatedAt: now,
    };
  },

  addSong: (songData) => {
    const newSong = get().createSong(songData);
    get().saveSong(newSong);
    return newSong;
  },

  saveSong: (song) => {
    const existing = get().songs.some((entry) => entry.id === song.id);
    const nextSongs = existing
      ? get().songs.map((entry) => (entry.id === song.id ? { ...song, updatedAt: Date.now() } : entry))
      : [song, ...get().songs];
    set({ songs: nextSongs });
    saveSongsToStorage(nextSongs);
  },

  updateSong: (id, patch) => {
    const nextSongs = get().songs.map((song) =>
      song.id === id ? { ...song, ...patch, updatedAt: Date.now() } : song
    );
    set({ songs: nextSongs });
    saveSongsToStorage(nextSongs);
  },

  deleteSong: (id) => {
    const nextSongs = get().songs.filter((song) => song.id !== id);
    set({ songs: nextSongs });
    saveSongsToStorage(nextSongs);
  },

  renameSong: (id, title, artist) => {
    const nextSongs = get().songs.map((song) => {
      if (song.id !== id) return song;
      return {
        ...song,
        title: title.trim() || song.title,
        artist: artist !== undefined ? artist.trim() : song.artist,
        updatedAt: Date.now(),
      };
    });
    set({ songs: nextSongs });
    saveSongsToStorage(nextSongs);
  },
}));
