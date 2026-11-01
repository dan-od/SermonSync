import { useSessionStore } from "../../stores/sessionStore";
import { formatElapsed } from "./headerBarUtils";

export function SessionClock() {
  const elapsed = useSessionStore((state) => state.elapsed);
  return formatElapsed(elapsed);
}
