export function isVideoDataUrl(src: string | null | undefined): boolean {
  return !!src && src.startsWith("data:video/");
}

/**
 * Decodes a `data:` URI into a `Blob` without `fetch()` (unreliable for `data:` URIs in Tauri's Linux webview).
 */
function dataUriToBlob(dataUri: string): Blob | null {
  const commaIndex = dataUri.indexOf(",");
  if (commaIndex === -1) return null;
  const header = dataUri.slice("data:".length, commaIndex);
  const isBase64 = /;base64$/i.test(header);
  const mime = header.replace(/;base64$/i, "").split(";")[0] || "application/octet-stream";
  const data = dataUri.slice(commaIndex + 1);
  try {
    if (isBase64) {
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(data)], { type: mime });
  } catch {
    return null;
  }
}

/**
 * Converts a `data:` video URI into a `Blob` object URL so `<video>` gets a real,
 * seekable resource instead of streaming a giant base64 string directly (which is
 * slow to start and can fail to seek in Tauri's Linux/WebKitGTK webview).
 * Returns the original source unchanged for non-`data:` URIs. Caller must revoke
 * the returned `objectUrl` (if any) when done with it.
 */
export function resolvePlayableVideoSrc(source: string): { src: string; objectUrl: string | null } | null {
  if (!source.startsWith("data:")) {
    return { src: source, objectUrl: null };
  }
  const blob = dataUriToBlob(source);
  if (!blob) return null;
  try {
    const objectUrl = URL.createObjectURL(blob);
    return { src: objectUrl, objectUrl };
  } catch {
    return null;
  }
}
