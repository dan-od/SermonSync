import type { RefObject } from "react";

interface CameraCaptureDialogProps {
  cameraDevices: MediaDeviceInfo[];
  selectedCameraId: string;
  setSelectedCameraId: (deviceId: string) => void;
  cameraError: string | null;
  cameraPreviewRef: RefObject<HTMLVideoElement | null>;
  closeCameraDialog: () => void;
  captureCameraFrame: () => void;
}

export function CameraCaptureDialog({ cameraDevices, selectedCameraId, setSelectedCameraId, cameraError, cameraPreviewRef, closeCameraDialog, captureCameraFrame }: CameraCaptureDialogProps) {
  return (
    <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCameraDialog(); }} style={{ position: "absolute", inset: 0, zIndex: 3, display: "grid", placeItems: "center", padding: "16px", background: "color-mix(in srgb, var(--overlay-backdrop) 72%, transparent)" }}>
      <section role="dialog" aria-modal="true" aria-labelledby="camera-capture-title" style={{ width: "min(560px, 100%)", background: "var(--bg-surface)", border: "1px solid var(--border-base)", borderRadius: "10px", boxShadow: "var(--shadow-lg)", padding: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "12px" }}>
          <div><h2 id="camera-capture-title" style={{ margin: 0, color: "var(--fg-base)", fontSize: "16px" }}>Camera capture</h2><p style={{ margin: "4px 0 0", color: "var(--fg-muted)", fontSize: "12px" }}>Select an integrated or connected video device, then capture a frame.</p></div>
          <button type="button" onClick={closeCameraDialog} title="Close camera capture" style={{ width: "28px", height: "28px", border: "none", borderRadius: "6px", background: "var(--bg-elevated)", color: "var(--fg-base)", cursor: "pointer" }}>×</button>
        </div>
        <label style={{ display: "grid", gap: "4px", color: "var(--fg-muted)", fontSize: "11px", marginBottom: "10px" }}>Video device
          <select value={selectedCameraId} onChange={(event) => setSelectedCameraId(event.target.value)} style={{ border: "none", borderRadius: "5px", background: "var(--bg-base)", color: "var(--fg-base)", padding: "8px", fontSize: "12px" }}>
            {cameraDevices.length === 0 ? <option value="">Detecting cameras...</option> : cameraDevices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}
          </select>
        </label>
        <div style={{ aspectRatio: "16 / 9", overflow: "hidden", borderRadius: "6px", background: "#0b0d14", display: "grid", placeItems: "center" }}>
          <video ref={cameraPreviewRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          {cameraError ? <span style={{ gridArea: "1 / 1", maxWidth: "80%", color: "#fff", fontSize: "12px", lineHeight: 1.4, textAlign: "center" }}>{cameraError}</span> : null}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "14px" }}><button type="button" onClick={closeCameraDialog} style={{ border: "none", borderRadius: "6px", background: "var(--bg-elevated)", color: "var(--fg-base)", padding: "8px 12px", cursor: "pointer" }}>Cancel</button><button type="button" onClick={captureCameraFrame} disabled={Boolean(cameraError)} style={{ border: "none", borderRadius: "6px", background: "var(--color-primary)", color: "var(--fg-on-accent)", padding: "8px 12px", fontWeight: 700, cursor: cameraError ? "not-allowed" : "pointer", opacity: cameraError ? 0.55 : 1 }}>Capture frame</button></div>
      </section>
    </div>
  );
}
