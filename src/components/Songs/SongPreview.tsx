import { useMemo } from "react";
import { type SongSlide } from "../../stores/songStore";
import { type TemplateScene } from "../../types/templates";
import { type ProjectorSlide } from "../../types/state";
import { TemplateSceneOverlay } from "../ProjectorView";

export function SongPreview({
  defaultSongScene,
  activeProjectorSlide,
  currentSlide,
}: {
  defaultSongScene: TemplateScene | null;
  activeProjectorSlide: ProjectorSlide;
  currentSlide: SongSlide;
}) {
  const previewScene = useMemo(
    () => defaultSongScene
      ? { ...defaultSongScene, backgroundStart: "#000000", backgroundEnd: "#000000" }
      : null,
    [defaultSongScene],
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        background: "var(--bg-base)",
        overflow: "hidden",
      }}
    >
      {/* Top Canvas Preview Container */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          background: "var(--bg-surface)",
        }}
      >
        <div
          style={{
            width: "100%",
            maxHeight: "100%",
            aspectRatio: "16 / 9",
            position: "relative",
            borderRadius: "1px",
            overflow: "hidden",
            border: "none",
            boxShadow: "none",
          }}
        >
          {previewScene ? (
            <TemplateSceneOverlay
              scene={previewScene}
              slide={activeProjectorSlide}
              category="songs"
              fitToContainer
              isThumbnail
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#000000",
                color: "#ffffff",
                fontSize: "24px",
                textAlign: "center",
                padding: "30px",
              }}
            >
              {currentSlide.text || "No text for this slide yet"}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
