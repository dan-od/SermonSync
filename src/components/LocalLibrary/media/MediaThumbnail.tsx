import { convertFileSrc } from "@tauri-apps/api/core";
import { useMemo, useState } from "react";

import { ResilientVideo } from "../../ResilientVideo";
import type { MediaItem } from "./mediaLibrary";

export function MediaThumbnail({ item, onRemove }: { item: MediaItem; onRemove: () => void }) {
  const [isHovered, setIsHovered] = useState(false);
  const src = useMemo(() => {
    try {
      return convertFileSrc(item.path);
    } catch {
      return "";
    }
  }, [item.path]);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "1 / 1",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-base)",
          background: "var(--bg-elevated)",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {item.category === "images" && (
          <img src={src} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}
        {item.category === "videos" && (
          <ResilientVideo
            media={{ type: "video", src, fit: "cover", loop: false, x: 0, y: 0, width: 100, height: 100, opacity: 1, muted: true, speed: 1 }}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            autoPlay={false}
            playing={false}
            loop={false}
            preload="metadata"
          />
        )}
        {item.category === "audio" && (
          <span style={{ fontSize: 28, color: "var(--fg-muted)" }} aria-hidden>
            ♪
          </span>
        )}
        {isHovered && (
          <button
            type="button"
            title="Remove"
            onClick={onRemove}
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              width: 20,
              height: 20,
              borderRadius: "50%",
              border: "none",
              background: "rgba(0, 0, 0, 0.6)",
              color: "#fff",
              cursor: "pointer",
              fontSize: 12,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>
      <span
        title={item.name}
        style={{
          fontSize: "var(--text-xs)",
          color: "var(--fg-muted)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {item.name}
      </span>
    </div>
  );
}
