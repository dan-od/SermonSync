import type { Song } from "../../../stores/songStore";
import type { ProjectorSlide } from "../../../types/state";
import { PaneEmpty, ScripturePane } from "../primitives";
import { slideActionButtonStyle } from "../styles";
import { SlideThumbnail } from "./SlideThumbnail";
import { toSongProjectorSlide } from "./songUtils";

export function SongSlidesColumn({
  selectedSong,
  previewReference,
  liveReference,
  selectedSlideReference,
  setSelectedSlideReference,
  slideClickAction,
  setSlideClickAction,
  onPreviewSlide,
  onSendLive,
}: {
  selectedSong: Song | null;
  previewReference: string | null;
  liveReference: string | null;
  selectedSlideReference: string | null;
  setSelectedSlideReference: React.Dispatch<React.SetStateAction<string | null>>;
  slideClickAction: "preview" | "live";
  setSlideClickAction: React.Dispatch<React.SetStateAction<"preview" | "live">>;
  onPreviewSlide: (slide: ProjectorSlide) => void;
  onSendLive: (slide: ProjectorSlide) => void;
}) {
  return (
    <ScripturePane
      title="Slides"
      action={
        <div role="group" aria-label="Slide click action" style={{ display: "flex", overflow: "hidden", borderRadius: "var(--radius-sm)" }}>
          <button
            type="button"
            aria-pressed={slideClickAction === "preview"}
            onClick={() => setSlideClickAction("preview")}
            style={slideActionButtonStyle(slideClickAction === "preview")}
          >
            Preview First
          </button>
          <button
            type="button"
            aria-pressed={slideClickAction === "live"}
            onClick={() => setSlideClickAction("live")}
            style={slideActionButtonStyle(slideClickAction === "live")}
          >
            Live
          </button>
        </div>
      }
    >
      {selectedSong ? (
        <div style={{ padding: "var(--space-3)" }}>
          <div
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-base)",
              borderRadius: "var(--radius-lg)",
              padding: "var(--space-4)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
              boxShadow: "var(--shadow-md)",
            }}
          >
            {/* 4-up Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: "var(--space-3)",
              }}
            >
              {selectedSong.slides.map((slide, index) => {
                const projSlide = toSongProjectorSlide(selectedSong, slide, index);
                const label = `${projSlide.reference.book} ${projSlide.reference.chapter}:${projSlide.reference.verse}`;
                const isPreview = previewReference === label;
                const isLive = liveReference === label;
                const isSelected = selectedSlideReference === label || (selectedSlideReference === null && (isPreview || isLive));
                const selectSlide = () => setSelectedSlideReference(label);
                const sendSlideLive = () => {
                  selectSlide();
                  onSendLive(projSlide);
                };
                const previewSlide = () => {
                  selectSlide();
                  onPreviewSlide(projSlide);
                };

                return (
                  <div key={index} style={{ position: "relative" }}>
                  <SlideThumbnail
                    key={index}
                    slide={projSlide}
                    label={slide.label}
                    isPreview={isPreview}
                    isLive={isLive}
                    isSelected={isSelected}
                    onClick={slideClickAction === "preview" ? previewSlide : sendSlideLive}
                    onDoubleClick={slideClickAction === "preview" ? sendSlideLive : () => {}}
                    onFocus={selectSlide}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        if (slideClickAction === "preview") {
                          previewSlide();
                        } else {
                          sendSlideLive();
                        }
                      }
                    }}
                  />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <PaneEmpty>Select a song to view slides</PaneEmpty>
      )}
    </ScripturePane>
  );
}
