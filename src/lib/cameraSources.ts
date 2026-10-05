/**
 * Camera source discovery + connectivity helpers (wired/USB webcams and
 * capture cards via `navigator.mediaDevices`, plus network/Wi-Fi phone
 * cameras — DroidCam, IP Webcam, IVCam — reachable over HTTP MJPEG on the
 * same LAN).
 */
import { getSidecarHttpBase } from "./sidecarClient";

export interface LocalCameraDevice {
  deviceId: string;
  label: string;
}

export type NetworkCameraKind = "droidcam" | "ip-webcam" | "ivcam" | "custom";

export interface NetworkCameraConfig {
  id: string;
  name: string;
  kind: NetworkCameraKind;
  /** Full stream URL, e.g. http://192.168.1.42:4747/video */
  url: string;
}

export interface CameraSource {
  type: "local" | "network";
  /** Local: MediaDeviceInfo.deviceId. Network: NetworkCameraConfig.id. */
  id: string;
}

/** Presets for the common phone-camera apps so users only need to type an IP. */
export const NETWORK_CAMERA_PRESETS: { kind: NetworkCameraKind; label: string; buildUrl: (host: string) => string; hint: string }[] = [
  {
    kind: "ip-webcam",
    label: "IP Webcam (Android)",
    buildUrl: (host) => `http://${host}:8080/video`,
    hint: "Start the server in the IP Webcam app, then enter the IP address it displays. This app serves a real MJPEG stream, so it works here directly.",
  },
  {
    kind: "droidcam",
    label: "DroidCam (legacy IP Cam mode only)",
    buildUrl: (host) => `http://${host}:4747/video`,
    hint: "DroidCam's normal WiFi/OBS mode uses a proprietary protocol this app can't decode — that only works through DroidCam's own PC Client or OBS plugin. Install the DroidCam PC Client instead: it creates a virtual camera that shows up under \"Wired / USB\" here, exactly like it does in OBS. Only use this Wi-Fi option if you've confirmed the phone's browser shows a live image at this address.",
  },
  {
    kind: "ivcam",
    label: "iVCam (legacy IP Cam mode only)",
    buildUrl: (host) => `http://${host}:8080/video`,
    hint: "iVCam also installs a PC Client that creates a virtual camera under \"Wired / USB\" — that's the reliable option. Its own network protocol isn't a plain video stream, so this Wi-Fi option will only work if iVCam's settings expose a raw HTTP/MJPEG feed.",
  },
  {
    kind: "custom",
    label: "Custom URL",
    buildUrl: (host) => host,
    hint: "Paste any MJPEG/HTTP stream URL reachable on the local network.",
  },
];

export function backendAvailable(): boolean {
  return isLinuxWebKitCameraRuntime() || (typeof navigator !== "undefined" && !!navigator.mediaDevices?.enumerateDevices);
}

export function isLinuxWebKitCameraRuntime(): boolean {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent;
  return /Linux/.test(userAgent) && /AppleWebKit|WebKit/.test(userAgent) && !/Chrome|Chromium/.test(userAgent);
}

const CAMERA_PERMISSION_PROBE_TIMEOUT_MS = 2000;

async function enumerateVideoInputs(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === "videoinput");
}

async function requestCameraPermissionWithoutBlocking(): Promise<MediaStream | null> {
  // Some WebKitGTK builds leave getUserMedia pending when a V4L2 device is
  // unavailable to the media backend. Do not let that prevent enumeration or
  // leave the Settings/Template Studio rescan button disabled forever.
  const probePromise = navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<null>((resolve) => {
    timeoutId = window.setTimeout(() => resolve(null), CAMERA_PERMISSION_PROBE_TIMEOUT_MS);
  });

  try {
    const result = await Promise.race([probePromise, timeoutPromise]);
    if (result) return result;

    // The browser may resolve the original request after the timeout. Clean
    // up that late stream instead of keeping a camera open in the background.
    void probePromise.then((stream) => stream.getTracks().forEach((track) => track.stop())).catch(() => undefined);
    return null;
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

/**
 * Requests camera permission (required in most browsers/webviews before
 * device labels are populated) and returns the list of video input devices.
 * Covers both built-in/USB webcams and USB capture cards feeding a wired
 * camera — they all surface as ordinary `videoinput` devices.
 */
export async function listLocalCameras(): Promise<LocalCameraDevice[]> {
  if (!backendAvailable()) return [];

  // WebKitGTK's getUserMedia can abort the entire WebProcess inside
  // GStreamer/PipeWire. Discover V4L2 capture nodes through the sidecar
  // instead, without even requesting browser camera permission.
  if (isLinuxWebKitCameraRuntime()) {
    const response = await fetch(`${getSidecarHttpBase()}/api/camera/devices`);
    if (!response.ok) throw new Error("Unable to list local cameras from the camera bridge.");
    const result = await response.json() as { devices?: LocalCameraDevice[] };
    return Array.isArray(result.devices) ? result.devices.filter((device) => typeof device.deviceId === "string" && typeof device.label === "string") : [];
  }

  // Enumerate first so a denied or pending permission request cannot block a
  // rescan. A second pass fills in labels once permission is available.
  let probeStream: MediaStream | null = null;
  try {
    let devices = await enumerateVideoInputs();
    const needsPermission = devices.length === 0 || devices.some((device) => !device.label);
    if (needsPermission) {
      probeStream = await requestCameraPermissionWithoutBlocking();
      devices = await enumerateVideoInputs();
    }
    // Linux UVC cameras commonly expose a capture node and a metadata node.
    // WebKit lists both as video inputs with the same label, even though the
    // metadata node cannot produce a picture. Its groupId is not consistent
    // across WebKit builds, so deduplicate the displayed camera name.
    const seen = new Set<string>();
    return devices.flatMap((device, index) => {
      const label = device.label || `Camera ${index + 1}`;
      const key = device.label ? label.trim().toLocaleLowerCase() : device.deviceId;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ deviceId: device.deviceId, label }];
    });
  } finally {
    probeStream?.getTracks().forEach((track) => track.stop());
  }
}

/**
 * Verifies a network camera URL is reachable by loading it as an image
 * source (MJPEG streams render as one long-lived image response). Resolves
 * true/false rather than throwing, with a timeout so a dead IP doesn't hang.
 */
export function testNetworkCameraUrl(url: string, timeoutMs = 6000): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = new Image();
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      probe.onload = null;
      probe.onerror = null;
      probe.src = "";
      resolve(result);
    };
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    probe.onload = () => {
      window.clearTimeout(timer);
      finish(true);
    };
    probe.onerror = () => {
      window.clearTimeout(timer);
      finish(false);
    };
    probe.src = url;
  });
}

export function createNetworkCameraId(): string {
  return `netcam-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
