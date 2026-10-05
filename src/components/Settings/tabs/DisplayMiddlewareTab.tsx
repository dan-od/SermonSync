import { useEffect, useRef, useState } from "react";

import { IconMonitor, IconTrash, IconUpload } from "../icons";
import { InfoBanner, RadioCardGroup, SectionIntro, SelectRow, SettingsCard, TextRow, ToggleRow } from "../primitives";
import { closeProjectorOutput, discoverDisplays, openProjectorOutput } from "../../../lib/projectorOutput";
import { isVideoDataUrl, resolvePlayableVideoSrc } from "../../../lib/media";
import { useProjectorStore } from "../../../stores/projectorStore";
import { type IdleScreenMode, type LogoFit, type SettingsPanelState } from "../types";

interface DisplayMiddlewareTabProps {
  panelState: SettingsPanelState;
  onPanelChange: <K extends keyof SettingsPanelState>(key: K, value: SettingsPanelState[K]) => void;
}

const IDLE_SCREEN_OPTIONS: { value: IdleScreenMode; label: string; description: string }[] = [
  { value: "logo", label: "Church Logo", description: "Show the uploaded church logo when no verse is active." },
  { value: "background", label: "Background Image", description: "Show a custom uploaded background image." },
  { value: "color", label: "Solid Color", description: "Show a plain configurable color fill." },
];

const LOGO_FIT_OPTIONS: { value: LogoFit; label: string; description: string }[] = [
  { value: "contain", label: "Fit to screen", description: "Keeps the logo's proportions, letterboxed if it doesn't match 16:9." },
  { value: "stretch", label: "Stretch to fill", description: "Stretches the logo to cover the full 1920\u00d71080 output canvas." },
];

// Kept well under typical localStorage per-origin quotas since the logo rides along with the rest of Settings.
const MAX_LOGO_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_LOGO_VIDEO_BYTES = 40 * 1024 * 1024;

function readLogoFile(file: File, onLoaded: (dataUrl: string) => void) {
  const isVideo = file.type.startsWith("video/");
  const limit = isVideo ? MAX_LOGO_VIDEO_BYTES : MAX_LOGO_IMAGE_BYTES;
  if (file.size > limit) {
    window.alert(`That ${isVideo ? "video" : "image"} is too large for a logo. Please choose a file smaller than ${limit / (1024 * 1024)} MB.`);
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => window.alert("The file could not be read.");
  reader.onload = () => onLoaded(String(reader.result));
  reader.readAsDataURL(file);
}

function LogoVideoPreview({ src, fit }: { src: string; fit: LogoFit }) {
  const [resolved] = useState(() => resolvePlayableVideoSrc(src));

  useEffect(() => {
    return () => {
      if (resolved?.objectUrl) URL.revokeObjectURL(resolved.objectUrl);
    };
  }, [resolved]);

  return (
    <video
      src={resolved?.src ?? src}
      autoPlay
      muted
      loop
      playsInline
      controls
      preload="auto"
      style={{ width: "100%", height: "100%", objectFit: fit === "stretch" ? "fill" : "contain" }}
    />
  );
}

export function DisplayMiddlewareTab({ panelState, onPanelChange }: DisplayMiddlewareTabProps) {
  const displays = useProjectorStore((state) => state.availableDisplays);
  const selectedDisplayId = useProjectorStore((state) => state.selectedDisplayId);
  const outputStatus = useProjectorStore((state) => state.outputStatus);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const refreshDisplays = async () => {
    try {
      const nextDisplays = await discoverDisplays();
      const store = useProjectorStore.getState();
      store.setAvailableDisplays(nextDisplays);
      const current = nextDisplays.find((display) => display.id === store.selectedDisplayId);
      const fallback = current ?? nextDisplays.find((display) => display.isPrimary) ?? nextDisplays[0];
      if (fallback && !store.selectedDisplayId) {
        store.selectDisplay(fallback.id);
        onPanelChange("outputDisplayId", fallback.id);
      }
    } catch {
      useProjectorStore.getState().setOutputStatus("error");
    }
  };

  const selected = displays.find((display) => display.id === selectedDisplayId);
  const displayOptions = displays.map((display) => ({
    value: display.id,
    label: `${display.friendlyName || display.name} — ${display.width}×${display.height} • ${display.refreshHz ? `${display.refreshHz}Hz` : "—Hz"}`,
  }));

  const handleDisplayChange = (displayId: string) => {
    useProjectorStore.getState().selectDisplay(displayId);
    onPanelChange("outputDisplayId", displayId);
    if (outputStatus === "connected") {
      const next = displays.find((display) => display.id === displayId);
      if (next) void openProjectorOutput(next).catch(() => undefined);
    }
  };

  const openSelectedDisplay = () => {
    if (!selected) return;
    void openProjectorOutput(selected).catch(() => undefined);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <SectionIntro
        title="Display & Middleware Output"
        description="EasyWorship-style display takeover for standalone churches, or feed content into OBS/EasyWorship/ProPresenter as middleware (PRD §5.3, §5.4)."
      />

      <SettingsCard icon={<IconMonitor />} title="Output Display" subtitle="Any resolution, hot-plug supported">
        <SelectRow
          label="Active Output Display"
          hint={displays.length === 0 ? "No connected displays detected" : undefined}
          value={selectedDisplayId ?? panelState.outputDisplayId}
          options={displayOptions.length > 0 ? displayOptions : [{ value: panelState.outputDisplayId, label: "No display detected" }]}
          onChange={handleDisplayChange}
        />
        {selected ? <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginTop: "8px", padding: "9px 10px", borderRadius: "var(--radius-md)", background: "var(--bg-base)", color: "var(--fg-muted)", fontFamily: "var(--font-mono)", fontSize: "10px" }}>
          <span>{selected.width}×{selected.height} • {selected.refreshHz ? `${selected.refreshHz}Hz` : "—Hz"}</span>
          <span style={{ color: outputStatus === "connected" ? "var(--color-success)" : outputStatus === "disconnected" ? "var(--color-warning)" : "var(--fg-subtle)" }}>{outputStatus.toUpperCase()}</span>
        </div> : null}
        <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
          <button type="button" onClick={() => void refreshDisplays()} style={{ flex: 1, border: "none", borderRadius: "var(--radius-md)", padding: "8px 10px", background: "var(--bg-elevated)", color: "var(--fg-base)", cursor: "pointer", fontSize: "11px" }}>Refresh displays</button>
          {outputStatus === "connected" ? (
            <button type="button" onClick={() => void closeProjectorOutput()} style={{ flex: 1, border: "none", borderRadius: "var(--radius-md)", padding: "8px 10px", background: "var(--color-primary-muted)", color: "var(--color-primary)", cursor: "pointer", fontSize: "11px" }}>Close output</button>
          ) : (
            <button type="button" disabled={!selected} onClick={openSelectedDisplay} style={{ flex: 1, border: "none", borderRadius: "var(--radius-md)", padding: "8px 10px", background: "var(--color-primary)", color: "var(--fg-on-accent)", cursor: selected ? "pointer" : "not-allowed", opacity: selected ? 1 : 0.5, fontSize: "11px" }}>Open output</button>
          )}
        </div>
      </SettingsCard>

      <SettingsCard icon={<IconUpload />} title="Church Logo Overlay" subtitle="Shown live when the Logo feed override is toggled on">
        {panelState.logo.src ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ width: "100%", aspectRatio: "16 / 9", borderRadius: "var(--radius-md)", background: "var(--bg-base)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {isVideoDataUrl(panelState.logo.src) ? (
                <LogoVideoPreview key={panelState.logo.src} src={panelState.logo.src} fit={panelState.logo.fit} />
              ) : (
                <img
                  src={panelState.logo.src}
                  alt="Church logo preview"
                  style={{ width: "100%", height: "100%", objectFit: panelState.logo.fit === "stretch" ? "fill" : "contain" }}
                />
              )}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" onClick={() => logoInputRef.current?.click()} style={{ flex: 1, border: "none", borderRadius: "var(--radius-md)", padding: "8px 10px", background: "var(--bg-elevated)", color: "var(--fg-base)", cursor: "pointer", fontSize: "11px" }}>Replace {isVideoDataUrl(panelState.logo.src) ? "video" : "image"}</button>
              <button
                type="button"
                onClick={() => onPanelChange("logo", { ...panelState.logo, src: null })}
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", border: "none", borderRadius: "var(--radius-md)", padding: "8px 10px", background: "var(--color-primary-muted)", color: "var(--color-primary)", cursor: "pointer", fontSize: "11px" }}
              >
                <IconTrash /> Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => logoInputRef.current?.click()}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%", aspectRatio: "16 / 9", border: "1px dashed var(--border-base)", borderRadius: "var(--radius-md)", background: "var(--bg-base)", color: "var(--fg-muted)", cursor: "pointer", fontSize: "11px" }}
          >
            <IconUpload />
            Upload logo image or video (PNG, JPG, SVG, MP4, WebM…)
          </button>
        )}
        <input
          ref={logoInputRef}
          type="file"
          accept="image/*,video/*"
          style={{ display: "none" }}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) readLogoFile(file, (src) => onPanelChange("logo", { ...panelState.logo, src }));
          }}
        />
        <RadioCardGroup
          options={LOGO_FIT_OPTIONS}
          value={panelState.logo.fit}
          onChange={(fit) => onPanelChange("logo", { ...panelState.logo, fit })}
          columns={2}
        />
        <InfoBanner>
          Recommended size 1920 × 1080 (Full HD) — standard imports project at full quality with no extra setup. Use "Stretch to fill" only for logos designed edge-to-edge. Video logos loop automatically and keep looping live until manually paused.
        </InfoBanner>
      </SettingsCard>

      <SettingsCard icon={<IconMonitor />} title="Idle Screen">
        <RadioCardGroup
          options={IDLE_SCREEN_OPTIONS}
          value={panelState.idleScreenMode}
          onChange={(value) => onPanelChange("idleScreenMode", value)}
          columns={1}
        />
        {panelState.idleScreenMode === "color" ? (
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <input
              type="color"
              value={panelState.idleScreenColor}
              onChange={(e) => onPanelChange("idleScreenColor", e.target.value)}
              style={{ width: "40px", height: "32px", borderRadius: "var(--radius-md)", background: "none", cursor: "pointer" }}
            />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
              {panelState.idleScreenColor}
            </span>
          </div>
        ) : null}
      </SettingsCard>

      <SettingsCard icon={<IconMonitor />} title="Middleware Outputs" subtitle="All can run simultaneously alongside standalone mode">
        <ToggleRow
          label="Web canvas"
          description="Add as a browser source in OBS or EasyWorship."
          checked={panelState.webCanvasEnabled}
          onChange={(value) => onPanelChange("webCanvasEnabled", value)}
        />
        {panelState.webCanvasEnabled ? (
          <TextRow
            label="Web canvas port"
            value={String(panelState.webCanvasPort)}
            onChange={(value) => onPanelChange("webCanvasPort", Number(value) || 8080)}
            hint={`Accessible locally at http://localhost:${panelState.webCanvasPort}`}
          />
        ) : null}
        <ToggleRow
          label="Green screen window"
          description="Chroma key compositing in any video switcher."
          checked={panelState.greenScreenEnabled}
          onChange={(value) => onPanelChange("greenScreenEnabled", value)}
        />
        {panelState.greenScreenEnabled ? (
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <input
              type="color"
              value={panelState.chromaKeyColor}
              onChange={(e) => onPanelChange("chromaKeyColor", e.target.value)}
              style={{ width: "40px", height: "32px", borderRadius: "var(--radius-md)", background: "none", cursor: "pointer" }}
            />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Chroma key color</span>
          </div>
        ) : null}
        <ToggleRow
          label="NDI Alpha stream"
          description="Network video for ProPresenter, vMix, OBS with the NDI plugin."
          checked={panelState.ndiEnabled}
          onChange={(value) => onPanelChange("ndiEnabled", value)}
        />
        <InfoBanner>Middleware mode is aimed at established branches already using EasyWorship, OBS, or ProPresenter.</InfoBanner>
      </SettingsCard>
    </div>
  );
}
