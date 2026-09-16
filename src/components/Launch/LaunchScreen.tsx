import { useState } from "react";

import { FlippingTitle } from "./FlippingTitle";
import { LaunchTitleBar } from "./LaunchTitleBar";
import { launchKeyframes } from "./launchAnimations";
import { SidecarLogStream } from "./SidecarLogStream";
import { DEFAULT_LAUNCH_SETTINGS, type LaunchAnimationSettings } from "./types";
import { TypewriterIntro } from "./TypewriterIntro";
import { WaveVectorAnimation } from "./WaveVectorAnimation";

export interface LaunchScreenProps {
  /** Called once the sidecar boot log stream finishes, to hand off to Auth. */
  onProceedToAuth: () => void;
  settings?: LaunchAnimationSettings;
}

/**
 * Full-screen launch/splash sequence shown once on app start, replacing the
 * blank white screen that otherwise appears before the AuthGate mounts.
 *
 * Styled entirely with inline styles + the app's existing CSS custom
 * properties (tokens.css) — no Tailwind, no new global stylesheet, no
 * background colors outside the design system.
 */
export function LaunchScreen({ onProceedToAuth, settings = DEFAULT_LAUNCH_SETTINGS }: LaunchScreenProps) {
  const [isTransitioning, setIsTransitioning] = useState(false);

  const handleProceed = () => {
    setIsTransitioning(true);
    window.setTimeout(() => {
      onProceedToAuth();
      if (typeof window !== "undefined" && (window as unknown as { __TAURI__?: { event?: { emit?: (name: string, payload: unknown) => void } } }).__TAURI__) {
        (window as unknown as { __TAURI__: { event?: { emit?: (name: string, payload: unknown) => void } } }).__TAURI__.event?.emit?.(
          "sermonsync:sidecar-ready",
          { status: "ready" },
        );
      }
    }, 600);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        alignItems: "center",
        overflow: "hidden",
        userSelect: "none",
        background: "radial-gradient(circle at 50% 42%, rgba(123, 47, 247, 0.24) 0%, rgba(123, 47, 247, 0.11) 38%, rgba(123, 47, 247, 0) 74%), var(--bg-base)",
        // No top padding: the title bar must sit flush against the window's
        // top edge, like native decorations would. Bottom padding only.
        padding: "0 0 40px",
        fontFamily: "var(--font-sans)",
      }}
      className={isTransitioning ? "ss-launch-exiting" : undefined}
    >
      <style>{launchKeyframes}</style>
      <LaunchTitleBar />

      {/* Ambient glow orbs, using the design-token primary color only */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          overflow: "hidden",
          pointerEvents: "none",
          zIndex: 0,
          background: "radial-gradient(circle at 50% 42%, rgba(123, 47, 247, 0.1) 0%, rgba(123, 47, 247, 0) 70%)",
        }}
      >
        <div
          className="ss-launch-orb-a"
          style={{
            position: "absolute",
            top: "-12%",
            left: "-10%",
            width: 750,
            height: 750,
            background: "var(--color-primary)",
            borderRadius: "9999px",
            filter: "blur(140px)",
            opacity: 0.12 * settings.glowIntensity,
          }}
        />
        <div
          className="ss-launch-orb-b"
          style={{
            position: "absolute",
            bottom: "-18%",
            right: "-10%",
            width: 650,
            height: 650,
            background: "var(--color-primary)",
            borderRadius: "9999px",
            filter: "blur(130px)",
            opacity: 0.09 * settings.glowIntensity,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 720,
            height: 720,
            background: "var(--color-primary)",
            borderRadius: "9999px",
            filter: "blur(160px)",
            opacity: 0.22 * settings.glowIntensity,
          }}
        />
      </div>

      <div style={{ width: "100%", height: 8, pointerEvents: "none" }} />

      <div
        style={{
          zIndex: 10,
          width: "100%",
          height: "calc(100% - 34px)",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          margin: "auto 0",
          padding: "4px 0",
          position: "relative",
        }}
      >
        {/* Concentric ring backdrop */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            zIndex: -1,
          }}
        >
          <div
            className="ss-launch-glow-ring"
            style={{
              width: 560,
              height: 560,
              border: "1px solid rgba(123, 47, 247, 0.2)",
              borderRadius: "9999px",
            }}
          />
          <div
            style={{
              position: "absolute",
              width: 780,
              height: 780,
              border: "1px solid rgba(123, 47, 247, 0.1)",
              borderRadius: "9999px",
            }}
          />
          <div
            style={{
              position: "absolute",
              width: 1000,
              height: 1000,
              border: "1px solid rgba(232, 232, 240, 0.03)",
              borderRadius: "9999px",
            }}
          />
        </div>

        {/* Headline */}
        <div
          className="ss-launch-fade-down"
          style={{
            textAlign: "center",
            position: "relative",
            display: "flex",
            flex: "0 0 96px",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            padding: "0 16px",
            maxWidth: 900,
          }}
        >
          <h1
            style={{
              fontSize: 72,
              fontWeight: 700,
              color: "var(--fg-base)",
              letterSpacing: "-0.03em",
              lineHeight: 1,
              userSelect: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "1.15em",
              margin: 0,
            }}
          >
            <FlippingTitle text="SermonSync" />
          </h1>

          <div
            style={{
              height: 1.5,
              width: 128,
              background: "linear-gradient(90deg, transparent, var(--color-primary), transparent)",
              opacity: 0.8,
            }}
          />
        </div>

        {/* Typewriter intro statements */}
        <div
          className="ss-launch-fade-up"
          style={{
            textAlign: "center",
            position: "relative",
            flex: "0 0 116px",
            height: 116,
            margin: 0,
            padding: "0 16px",
            maxWidth: 900,
            width: "100%",
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <TypewriterIntro />
        </div>

        {/* Vector wave animation */}
        <div style={{ width: "100%", position: "relative" }}>
          <WaveVectorAnimation
            speed={settings.waveSpeed}
            glowIntensity={settings.glowIntensity}
            strandCount={settings.strandCount}
            glowColor={settings.ambientGlowColor}
            isTransitioning={isTransitioning}
          />
        </div>

        {/* Sidecar boot log stream -> hands off to Auth on completion */}
        <div
          className="ss-launch-fade-up"
          style={{ width: "100%", height: 150, flex: "0 0 150px", marginTop: 16, zIndex: 20 }}
        >
          <SidecarLogStream onComplete={handleProceed} />
        </div>
      </div>

      <div style={{ width: "100%", height: 16, pointerEvents: "none" }} />
    </div>
  );
}
