import { invoke } from "@tauri-apps/api/core";
import { useEffect, useLayoutEffect, useRef, useState, type ImgHTMLAttributes } from "react";

interface ResilientImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> {
  src: string;
  sourcePath: string;
  onUnavailable?: () => void;
}

interface FallbackState {
  key: string;
  status: "loading" | "ready" | "failed";
  src?: string;
}

/** Reads a local image through the native command when WebKit cannot load its asset URL. */
export function ResilientImage({ src, sourcePath, onUnavailable, onLoad, style, alt, ...props }: ResilientImageProps) {
  const key = `${sourcePath}\0${src}`;
  const currentKey = useRef(key);
  useLayoutEffect(() => { currentKey.current = key; }, [key]);
  const [fallback, setFallback] = useState<FallbackState | null>(null);
  const state = fallback?.key === key ? fallback : null;

  const loadFallback = () => {
    if (state || !sourcePath) return;
    setFallback({ key, status: "loading" });
    void invoke<string>("read_template_image_file", { path: sourcePath })
      .then((dataUrl) => {
        if (currentKey.current === key) setFallback({ key, status: "ready", src: dataUrl });
      })
      .catch(() => {
        if (currentKey.current !== key) return;
        setFallback({ key, status: "failed" });
        onUnavailable?.();
      });
  };

  useEffect(() => {
    if (!src && sourcePath && !state) queueMicrotask(loadFallback);
  });

  if (state?.status === "loading") {
    return <div role="status" style={{ ...style, display: "grid", placeItems: "center", color: "var(--fg-muted)", fontSize: 12 }}>Loading image…</div>;
  }
  if (state?.status === "failed" || (!src && !sourcePath)) {
    return <div role="img" aria-label={alt || "Image unavailable"} style={{ ...style, display: "grid", placeItems: "center", color: "var(--fg-muted)", fontSize: 12 }}>Image unavailable</div>;
  }

  return (
    <img
      {...props}
      src={state?.src ?? src}
      alt={alt}
      style={style}
      onLoad={onLoad}
      onError={() => {
        if (!state) loadFallback();
        else if (state.status === "ready") {
          setFallback({ key, status: "failed" });
          onUnavailable?.();
        }
      }}
    />
  );
}
