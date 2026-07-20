import { useEffect, useRef, useState } from "react";

import type { OverlayMode, ProjectorSlide, VerseTheme } from "../types/state";

const OVERLAY_WIDTH = 1920;
const OVERLAY_HEIGHT = 1080;
const VIEWPORT_SAFE_INSET = 2;

function referenceLabel(slide: ProjectorSlide) {
  return `${slide.reference.book} ${slide.reference.chapter}:${slide.reference.verse}`;
}

function accent(theme: VerseTheme) {
  if (theme === "cup") {
    return "var(--theme-cup)";
  }
  if (theme === "crown") {
    return "var(--theme-crown)";
  }
  return "var(--theme-cross)";
}

function themeLabel(theme: VerseTheme) {
  if (theme === "cup") {
    return "COMMUNION";
  }
  if (theme === "crown") {
    return "KINGDOM";
  }
  return "SALVATION";
}

interface ProjectorViewProps {
  title: string;
  slide: ProjectorSlide | null;
  feedOverride: "live" | "logo" | "black" | "clear";
  overlayMode: OverlayMode;
  theme: VerseTheme;
  isLive: boolean;
  fontSizePx: number;
}

export function ProjectorView({ title, slide, feedOverride, overlayMode, theme, isLive, fontSizePx }: ProjectorViewProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: OVERLAY_WIDTH, height: OVERLAY_HEIGHT });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const updateScale = () => {
      const bounds = stage.getBoundingClientRect();
      const usableWidth = Math.max(0, bounds.width - VIEWPORT_SAFE_INSET * 2);
      const usableHeight = Math.max(0, bounds.height - VIEWPORT_SAFE_INSET * 2);
      const overlayRatio = OVERLAY_WIDTH / OVERLAY_HEIGHT;

      if (usableWidth <= 0 || usableHeight <= 0) {
        setViewportSize({ width: OVERLAY_WIDTH, height: OVERLAY_HEIGHT });
        return;
      }

      const stageRatio = usableWidth / usableHeight;

      if (stageRatio > overlayRatio) {
        const nextHeight = usableHeight;
        const nextWidth = nextHeight * overlayRatio;
        setViewportSize({ width: nextWidth, height: nextHeight });
      } else {
        const nextWidth = usableWidth;
        const nextHeight = nextWidth / overlayRatio;
        setViewportSize({ width: nextWidth, height: nextHeight });
      }
    };

    updateScale();

    const observer = new ResizeObserver(updateScale);
    observer.observe(stage);

    return () => observer.disconnect();
  }, []);

  const accentColor = accent(theme);
  const previewScale = fontSizePx / 48;
  const displayFontSize = `${Math.max(56, Math.round(fontSizePx * 2.2))}px`;
  const referenceFontSize = `${Math.max(30, Math.round(42 * previewScale))}px`;
  const versionFontSize = `${Math.max(18, Math.round(24 * previewScale))}px`;
  const canvasScale = viewportSize.width / OVERLAY_WIDTH;
  const isLowerThird = overlayMode === "lower-third";
  const lowerThirdTextSize = `${Math.max(40, Math.round(fontSizePx * 1.2))}px`;
  const lowerThirdMetaSize = `${Math.max(20, Math.round(fontSizePx * 0.56))}px`;
  const isBlackOverride = feedOverride === "black";
  const isClearOverride = feedOverride === "clear";
  const isLogoOverride = feedOverride === "logo";
  const showSlide = feedOverride === "live";

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 10px",
          background: "var(--projector-header-bg)",
          borderBottom: "1px solid var(--projector-header-border)",
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          color: "var(--projector-header-text)",
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        <style>{`
          @keyframes ssOnAirBlink {
            0%, 100% {
              opacity: 1;
            }
            50% {
              opacity: 0.35;
            }
          }
        `}</style>
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#b02845" }} />
          {title}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ color: "var(--projector-header-subtext)" }}>Scale:{fontSizePx}px</span>
          <span
            style={{
              border: isLive ? "none" : "1px solid #5b2035",
              borderRadius: "8px",
              padding: "4px 8px",
              background: isLive ? "#ffffff" : "transparent",
              color: isLive ? "#c32b4b" : "var(--projector-header-status-text)",
              fontSize: "10px",
              fontWeight: 700,
            }}
          >
            {isLive ? (
              <span style={{ animation: "ssOnAirBlink 1800ms ease-in-out infinite" }}>ON-AIR</span>
            ) : (
              "STANDBY"
            )}
          </span>
        </span>
      </div>
      <div
        ref={stageRef}
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingLeft: `${VIEWPORT_SAFE_INSET}px`,
          paddingRight: `${VIEWPORT_SAFE_INSET}px`,
          paddingTop: `${VIEWPORT_SAFE_INSET}px`,
          paddingBottom: `${VIEWPORT_SAFE_INSET}px`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${viewportSize.width}px`,
            height: `${viewportSize.height}px`,
            position: "relative",
            borderRadius: "var(--radius-lg)",
            background: isBlackOverride
              ? "#000000"
              : "linear-gradient(180deg, rgba(16, 20, 44, 0.95), rgba(8, 9, 18, 1))",
            overflow: "hidden",
          }}
        >
          {isClearOverride ? null : (
          <div
            style={{
              width: `${OVERLAY_WIDTH}px`,
              height: `${OVERLAY_HEIGHT}px`,
              boxSizing: "border-box",
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: `translate(-50%, -50%) scale(${canvasScale})`,
              transformOrigin: "center center",
              display: "flex",
              alignItems: isLowerThird ? "flex-end" : "center",
              justifyContent: isLowerThird ? "flex-start" : "center",
              padding: isLowerThird ? "56px 72px" : "48px",
              textAlign: isLowerThird ? "left" : "center",
            }}
          >
            {showSlide && slide ? (
              isLowerThird ? (
                <div
                  style={{
                    width: "1620px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: "210px",
                      top: "-52px",
                      padding: "16px 30px 14px",
                      borderRadius: "26px 26px 0 0",
                      background: `linear-gradient(90deg, ${accentColor}, rgba(28, 81, 165, 0.95))`,
                      color: "#f5f7ff",
                      fontFamily: "var(--font-mono)",
                      fontSize: "24px",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      boxShadow: "0 14px 32px rgba(2, 6, 23, 0.28)",
                    }}
                  >
                    {themeLabel(theme)}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "stretch",
                      minHeight: "230px",
                      filter: "drop-shadow(0 28px 36px rgba(3, 5, 16, 0.36))",
                    }}
                  >
                    <div
                      style={{
                        width: "208px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: `linear-gradient(180deg, ${accentColor}, rgba(42, 10, 64, 0.98))`,
                        clipPath: "polygon(0 0, 88% 0, 100% 50%, 88% 100%, 0 100%)",
                        color: "#f8fbff",
                        fontFamily: "var(--font-mono)",
                        fontSize: "30px",
                        fontWeight: 800,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        padding: "20px 28px 20px 20px",
                        zIndex: 1,
                      }}
                    >
                      WORD
                    </div>

                    <div
                      style={{
                        flex: 1,
                        marginLeft: "-18px",
                        background: "linear-gradient(90deg, rgba(18, 23, 66, 0.98), rgba(28, 12, 48, 0.98))",
                        borderRadius: "0 36px 36px 0",
                        borderTop: "1px solid rgba(119, 65, 120, 0.8)",
                        borderRight: "1px solid rgba(119, 65, 120, 0.8)",
                        borderBottom: "1px solid rgba(119, 65, 120, 0.8)",
                        padding: "32px 132px 30px 54px",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        gap: "14px",
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          inset: "auto 0 0 0",
                          height: "12px",
                          background: `linear-gradient(90deg, ${accentColor}, rgba(101, 42, 123, 0.95))`,
                          opacity: 0.92,
                        }}
                      />
                      <div
                        style={{
                          color: "#f3ecf1",
                          fontSize: lowerThirdTextSize,
                          lineHeight: 1.12,
                          fontFamily: "Georgia, serif",
                          maxWidth: "1180px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          display: "-webkit-box",
                          WebkitBoxOrient: "vertical",
                          WebkitLineClamp: 2,
                        }}
                      >
                        {slide.text}
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "18px", flexWrap: "wrap" }}>
                        <span style={{ color: "#ffffff", fontFamily: "var(--font-sans)", fontSize: `${Math.max(32, Math.round(46 * previewScale))}px`, fontWeight: 800 }}>
                          {referenceLabel(slide)}
                        </span>
                        <span style={{ color: accentColor, fontFamily: "var(--font-mono)", fontSize: lowerThirdMetaSize, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                          {slide.version} / English
                        </span>
                      </div>
                      <div
                        style={{
                          position: "absolute",
                          right: "34px",
                          top: "22px",
                          color: accentColor,
                          fontFamily: "var(--font-mono)",
                          fontSize: "18px",
                          letterSpacing: "0.12em",
                          opacity: 0.8,
                        }}
                      >
                        LOWER THIRD
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    height: "100%",
                    width: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px solid #78203b",
                    borderRadius: "var(--radius-lg)",
                    background: "radial-gradient(circle at 75% 45%, rgba(91, 17, 40, 0.42), rgba(29, 9, 31, 0.95))",
                    padding: "52px",
                    boxShadow: "var(--shadow-md)",
                    position: "relative",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: "24px" }}>
                    <span style={{ border: "1px solid #a42543", borderRadius: "999px", padding: "10px 24px", fontFamily: "var(--font-mono)", fontSize: "18px", color: "#d67b95" }}>
                      JESUS CHRIST AS SAVIOR
                    </span>
                  </div>
                  <div
                    style={{
                      color: "#f1e7ee",
                      fontSize: displayFontSize,
                      lineHeight: 1.2,
                      fontFamily: "Georgia, serif",
                      marginBottom: "24px",
                      maxWidth: "88%",
                      overflowWrap: "break-word",
                    }}
                  >
                    {`"${slide.text}"`}
                  </div>
                  <div style={{ color: accentColor, fontFamily: "var(--font-sans)", fontSize: referenceFontSize, fontWeight: 800 }}>
                    {referenceLabel(slide)}
                  </div>
                  <div style={{ color: "#b2aeb9", fontFamily: "var(--font-sans)", fontSize: versionFontSize, marginTop: "8px" }}>
                    English ({slide.version})
                  </div>
                  <div style={{ position: "absolute", right: "22px", bottom: "18px", color: "#6f1537", fontSize: `${Math.max(64, Math.round(88 * previewScale))}px`, lineHeight: 0.8 }}>♡</div>
                  <div style={{ color: "#b2aeb9", fontFamily: "var(--font-mono)", fontSize: versionFontSize, marginTop: "18px", opacity: 0.8 }}>
                    {slide.version}
                  </div>
                </div>
              )
            ) : isLogoOverride ? (
              <div
                style={{
                  color: "#e7eeff",
                  fontFamily: "var(--font-mono)",
                  fontSize: `${Math.max(40, Math.round(fontSizePx * 1.6))}px`,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                LOGO OVERLAY
              </div>
            ) : (
              <div style={{ color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", fontSize: "28px" }}>
                No verse loaded
              </div>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
