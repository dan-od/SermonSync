/**
 * Lightweight OS detection in the webview (no Tauri plugin required).
 *
 * The app now uses NATIVE window decorations per-OS (tauri.conf
 * `decorations: true` + macOS `titleBarStyle: "Overlay"`), so the operating
 * system draws the min/max/close controls — the app must not draw its own.
 */
function agentString(): string {
  if (typeof navigator === "undefined") return "";
  const nav = navigator as Navigator & { platform?: string; userAgentData?: { platform?: string } };
  return `${nav.userAgent ?? ""} ${nav.platform ?? ""} ${nav.userAgentData?.platform ?? ""}`;
}

export function isMacOS(): boolean {
  return /Mac|iPhone|iPad/i.test(agentString());
}

/** The custom header owns min/max/close controls when native decorations are off. */
export const USE_NATIVE_WINDOW_CONTROLS = false;

/**
 * On macOS the traffic lights are overlaid at the top-left (Overlay title-bar
 * style). Inset the custom bar's left content so it clears them.
 */
export const MAC_TRAFFIC_LIGHT_INSET = 76;
