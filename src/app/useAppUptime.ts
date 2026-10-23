import { useEffect, useState } from "react";

const appLaunchTime = Date.now();

export function useAppUptime() {
  // App uptime is a standalone concern — it must keep counting whether or not
  // a session is live, same as the rest of the app's standalone output/display
  // behavior. Ticks locally from launch instead of only from session-scoped state.
  const [appUptimeSeconds, setAppUptimeSeconds] = useState(() => Math.floor((Date.now() - appLaunchTime) / 1000));

  useEffect(() => {
    const id = window.setInterval(() => {
      setAppUptimeSeconds(Math.floor((Date.now() - appLaunchTime) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return { appUptimeSeconds };
}
