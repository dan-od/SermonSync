import { useCallback, useEffect, useRef, useState } from "react";

import { IconCamera, IconTrash, IconWifi } from "../icons";
import { InfoBanner, SectionIntro, SelectRow, SettingsCard, StatusPill, TextRow } from "../primitives";
import {
  NETWORK_CAMERA_PRESETS,
  backendAvailable,
  createNetworkCameraId,
  listLocalCameras,
  testNetworkCameraUrl,
  type LocalCameraDevice,
  type NetworkCameraKind,
} from "../../../lib/cameraSources";
import { useCameraStore } from "../../../stores/cameraStore";

export function CameraTab() {
  const networkCameras = useCameraStore((s) => s.networkCameras);
  const addNetworkCamera = useCameraStore((s) => s.addNetworkCamera);
  const removeNetworkCamera = useCameraStore((s) => s.removeNetworkCamera);

  const [localCameras, setLocalCameras] = useState<LocalCameraDevice[]>([]);
  const [isDetecting, setIsDetecting] = useState(() => backendAvailable());
  const [detectError, setDetectError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<NetworkCameraKind>("ip-webcam");
  const [newHost, setNewHost] = useState("");
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "failed">("idle");
  const testTokenRef = useRef(0);

  const detectLocalCameras = useCallback(async () => {
    setIsDetecting(true);
    setDetectError(null);
    try {
      const devices = await listLocalCameras();
      setLocalCameras(devices);
      if (devices.length === 0) setDetectError("No wired/USB cameras or capture cards were found.");
    } catch (error) {
      setDetectError(error instanceof Error ? error.message : "Unable to access camera devices.");
    } finally {
      setIsDetecting(false);
    }
  }, []);

  useEffect(() => {
    if (!backendAvailable()) return;
    const initialScan = window.setTimeout(() => void detectLocalCameras(), 0);
    const mediaDevices = navigator.mediaDevices;
    const handleDeviceChange = () => void detectLocalCameras();
    mediaDevices?.addEventListener?.("devicechange", handleDeviceChange);
    return () => {
      window.clearTimeout(initialScan);
      mediaDevices?.removeEventListener?.("devicechange", handleDeviceChange);
    };
  }, [detectLocalCameras]);

  const preset = NETWORK_CAMERA_PRESETS.find((p) => p.kind === newKind) ?? NETWORK_CAMERA_PRESETS[0];
  const previewUrl = newHost.trim() ? preset.buildUrl(newHost.trim()) : "";

  const handleTest = async () => {
    if (!previewUrl) return;
    const token = ++testTokenRef.current;
    setTestStatus("testing");
    const reachable = await testNetworkCameraUrl(previewUrl);
    if (testTokenRef.current !== token) return;
    setTestStatus(reachable ? "ok" : "failed");
  };

  const handleAdd = () => {
    if (!previewUrl) return;
    addNetworkCamera({ id: createNetworkCameraId(), name: newName.trim() || preset.label, kind: newKind, url: previewUrl });
    setNewName("");
    setNewHost("");
    setTestStatus("idle");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <SectionIntro
        title="Camera & Wireless Devices"
        description="Detect wired cameras and capture cards, and register Wi-Fi phone cameras (DroidCam, IP Webcam, iVCam) so they can be picked as a live background in the Template Studio."
      />

      <SettingsCard
        icon={<IconCamera />}
        title="Wired & USB Cameras"
        subtitle={isDetecting ? "Scanning for connected cameras…" : `${localCameras.length} device${localCameras.length === 1 ? "" : "s"} found`}
      >
        {!backendAvailable() ? (
          <InfoBanner tone="warning">Camera detection is unavailable in this application runtime.</InfoBanner>
        ) : (
          <>
            {localCameras.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {localCameras.map((device) => (
                  <div key={device.deviceId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "9px 10px", borderRadius: "var(--radius-md)", background: "var(--bg-base)" }}>
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-base)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{device.label}</span>
                    <StatusPill tone="success" label="DETECTED" />
                  </div>
                ))}
              </div>
            ) : (
              <InfoBanner>{detectError ?? "No cameras detected yet. Plug in a USB webcam or capture card, then rescan."}</InfoBanner>
            )}
            <button
              type="button"
              onClick={() => void detectLocalCameras()}
              disabled={isDetecting}
              style={{ marginTop: "10px", border: "none", borderRadius: "var(--radius-md)", padding: "8px 10px", background: "var(--bg-elevated)", color: "var(--fg-base)", cursor: isDetecting ? "not-allowed" : "pointer", fontSize: "11px", opacity: isDetecting ? 0.6 : 1 }}
            >
              {isDetecting ? "Scanning…" : "Rescan for cameras"}
            </button>
            <InfoBanner>
              A USB capture card feeding an in-house camera shows up here the same way as a plain webcam — no separate wired setup is needed. Pick the device from this list as a template's background in the Template Studio.
            </InfoBanner>
          </>
        )}
      </SettingsCard>

      <SettingsCard icon={<IconWifi />} title="Wi-Fi Phone Cameras" subtitle="Same network as this PC required">
        <InfoBanner>
          This app can only view a phone camera directly over Wi-Fi if it serves a plain HTTP/MJPEG stream — that's what apps like IP Webcam do. DroidCam and iVCam normally use their own proprietary protocol (the same one their OBS plugin/PC Client speaks) which can't be viewed this way.
        </InfoBanner>
        <InfoBanner tone="warning">
          For DroidCam or iVCam: install that app's PC Client on this computer (not just the OBS plugin) — it creates a virtual camera device, which then shows up under "Wired &amp; USB Cameras" above, exactly like it does in OBS.
        </InfoBanner>
        <SelectRow
          label="App"
          value={newKind}
          options={NETWORK_CAMERA_PRESETS.map((p) => ({ value: p.kind, label: p.label }))}
          onChange={(value) => setNewKind(value as NetworkCameraKind)}
          hint={preset.hint}
        />
        <TextRow
          label="Name"
          value={newName}
          onChange={setNewName}
          placeholder={preset.label}
        />
        <TextRow
          label={newKind === "custom" ? "Stream URL" : "Phone IP address"}
          value={newHost}
          onChange={(value) => { setNewHost(value); setTestStatus("idle"); }}
          placeholder={newKind === "custom" ? "http://192.168.1.42:8080/video" : "192.168.1.42"}
        />
        {previewUrl ? (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--fg-subtle)" }}>
            {previewUrl}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
          <button
            type="button"
            onClick={() => void handleTest()}
            disabled={!previewUrl || testStatus === "testing"}
            style={{ flex: 1, border: "none", borderRadius: "var(--radius-md)", padding: "8px 10px", background: "var(--bg-elevated)", color: "var(--fg-base)", cursor: previewUrl ? "pointer" : "not-allowed", fontSize: "11px", opacity: previewUrl ? 1 : 0.5 }}
          >
            {testStatus === "testing" ? "Testing…" : "Test connection"}
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!previewUrl}
            style={{ flex: 1, border: "none", borderRadius: "var(--radius-md)", padding: "8px 10px", background: "var(--color-primary)", color: "var(--fg-on-accent)", cursor: previewUrl ? "pointer" : "not-allowed", fontSize: "11px", opacity: previewUrl ? 1 : 0.5 }}
          >
            Add camera
          </button>
        </div>
        {testStatus === "ok" ? <StatusPill tone="success" label="REACHABLE" /> : null}
        {testStatus === "failed" ? <StatusPill tone="error" label="NOT REACHABLE — check IP and Wi-Fi network" /> : null}
      </SettingsCard>

      <SettingsCard icon={<IconWifi />} title="Saved Wi-Fi Cameras" subtitle={`${networkCameras.length} saved`}>
        {networkCameras.length === 0 ? (
          <InfoBanner>No Wi-Fi cameras saved yet.</InfoBanner>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {networkCameras.map((camera) => (
              <div key={camera.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "9px 10px", borderRadius: "var(--radius-md)", background: "var(--bg-base)" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-base)" }}>{camera.name}</p>
                  <p style={{ margin: "2px 0 0", fontSize: "10px", color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{camera.url}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeNetworkCamera(camera.id)}
                  title="Remove"
                  aria-label={`Remove ${camera.name}`}
                  style={{ flexShrink: 0, display: "grid", placeItems: "center", width: "28px", height: "28px", border: "none", borderRadius: "var(--radius-md)", background: "var(--color-primary-muted)", color: "var(--color-error)", cursor: "pointer" }}
                >
                  <IconTrash />
                </button>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>
    </div>
  );
}
