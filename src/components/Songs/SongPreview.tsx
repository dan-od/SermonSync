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
          background: "radial-gradient(circle at center, rgba(30, 30, 42, 0.6) 0%, rgba(15, 15, 22, 0.95) 100%)",
        }}
      >
        <div
          style={{
            width: "100%",
            maxHeight: "100%",
            aspectRatio: "16 / 9",
            position: "relative",
            borderRadius: "8px",
            overflow: "hidden",
            border: "1px solid var(--border-base)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {defaultSongScene ? (
            <TemplateSceneOverlay
              scene={defaultSongScene}
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
                background: "linear-gradient(135deg, #181824 0%, #0d0d14 100%)",
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
