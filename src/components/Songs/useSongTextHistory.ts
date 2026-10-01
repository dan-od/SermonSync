import { useRef, type Dispatch, type SetStateAction } from "react";

/** Undo/redo for the Song Studio's full-song text editor. */
export function useSongTextHistory(songText: string, setSongText: Dispatch<SetStateAction<string>>) {
  // Coarse-grained undo/redo stacks for the song text editor, checkpointed on typing pauses.
  const songTextHistoryRef = useRef<{ past: string[]; future: string[] }>({ past: [], future: [] });
  const songTextCheckpointRef = useRef(songText);
  const songTextCheckpointTimeoutRef = useRef<number | null>(null);

  const commitSongTextCheckpoint = (value: string) => {
    if (value === songTextCheckpointRef.current) return;
    songTextHistoryRef.current.past.push(songTextCheckpointRef.current);
    songTextHistoryRef.current.future = [];
    songTextCheckpointRef.current = value;
  };

  const handleSongTextChange = (value: string) => {
    setSongText(value);
    if (songTextCheckpointTimeoutRef.current) window.clearTimeout(songTextCheckpointTimeoutRef.current);
    songTextCheckpointTimeoutRef.current = window.setTimeout(() => commitSongTextCheckpoint(value), 400);
  };

  const flushSongTextCheckpoint = () => {
    if (songTextCheckpointTimeoutRef.current) {
      window.clearTimeout(songTextCheckpointTimeoutRef.current);
      songTextCheckpointTimeoutRef.current = null;
      commitSongTextCheckpoint(songText);
    }
  };

  const handleSongTextUndo = () => {
    flushSongTextCheckpoint();
    const previous = songTextHistoryRef.current.past.pop();
    if (previous === undefined) return;
    songTextHistoryRef.current.future.push(songTextCheckpointRef.current);
    songTextCheckpointRef.current = previous;
    setSongText(previous);
  };

  const handleSongTextRedo = () => {
    flushSongTextCheckpoint();
    const next = songTextHistoryRef.current.future.pop();
    if (next === undefined) return;
    songTextHistoryRef.current.past.push(songTextCheckpointRef.current);
    songTextCheckpointRef.current = next;
    setSongText(next);
  };

  const handleSongTextKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (event.key === "z" || event.key === "Z") {
      event.preventDefault();
      handleSongTextUndo();
    } else if (event.key === "r" || event.key === "R") {
      event.preventDefault();
      handleSongTextRedo();
    }
  };

  return { handleSongTextChange, handleSongTextKeyDown };
}
