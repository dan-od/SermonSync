import { TemplateSceneOverlay } from "../ProjectorView";
import { projectionScene } from "../../lib/projectionScene";
import type { SongSlide } from "../../stores/songStore";
import type { ProjectorSlide } from "../../types/state";
import type { TemplateCanvasTheme } from "../../types/templates";

export function SongCanvasPreview({
  defaultSongTemplate,
  activeProjectorSlide,
  currentSlide,
}: {
  defaultSongTemplate: TemplateCanvasTheme | null;
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
          {defaultSongTemplate ? (
            <TemplateSceneOverlay
              scene={projectionScene(defaultSongTemplate)}
              slide={activeProjectorSlide}
              category="songs"
              fitToContainer
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

export function SongTextPanel({
  songText,
  handleSongTextChange,
  handleSongTextKeyDown,
}: {
  songText: string;
  handleSongTextChange: (value: string) => void;
  handleSongTextKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  return (
    <aside
      style={{
        minWidth: 0,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        borderLeft: "1px solid var(--border-base)",
        background: "var(--bg-surface)",
      }}
    >
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border-base)" }}>
        <div style={{ color: "var(--fg-base)", fontSize: "13px", fontWeight: 700 }}>Song text</div>
        <div style={{ marginTop: "4px", color: "var(--fg-subtle)", fontSize: "11px", lineHeight: 1.4 }}>
          Add tags manually. A blank line splits the next visual slide and keeps the last tag.
        </div>
      </div>
      <textarea
        value={songText}
        aria-label="Full song text"
        placeholder="[Verse 1]\nAmazing grace...\n\n[Chorus]\nHow sweet the sound..."
        onChange={(event) => handleSongTextChange(event.target.value)}
        onKeyDown={handleSongTextKeyDown}
        style={{
          flex: 1,
          width: "100%",
          minHeight: 0,
          border: "none",
          borderRadius: 0,
          background: "var(--bg-base)",
          color: "var(--fg-base)",
          padding: "14px",
          fontFamily: "var(--font-sans)",
          fontSize: "13px",
          lineHeight: 1.55,
          resize: "none",
          outline: "none",
        }}
      />
    </aside>
  );
}
