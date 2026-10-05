/**
 * Saved network camera registry (Wi-Fi phone cameras — DroidCam, IP Webcam,
 * iVCam — reachable over HTTP on the same LAN). Configured in
 * Settings → Camera, then picked from by name in the Template Studio's
 * background media picker. Persisted to localStorage like other lightweight
 * app-level config (see configStore.ts).
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { getBrowserStorage } from "./persistStorage";
import type { NetworkCameraConfig } from "../lib/cameraSources";

interface CameraStore {
  networkCameras: NetworkCameraConfig[];
  addNetworkCamera: (camera: NetworkCameraConfig) => void;
  updateNetworkCamera: (id: string, patch: Partial<NetworkCameraConfig>) => void;
  removeNetworkCamera: (id: string) => void;
}

export const useCameraStore = create<CameraStore>()(
  persist(
    (set) => ({
      networkCameras: [],

      addNetworkCamera: (camera) =>
        set((s) => ({ networkCameras: [...s.networkCameras, camera] })),

      updateNetworkCamera: (id, patch) =>
        set((s) => ({
          networkCameras: s.networkCameras.map((cam) => (cam.id === id ? { ...cam, ...patch } : cam)),
        })),

      removeNetworkCamera: (id) =>
        set((s) => ({ networkCameras: s.networkCameras.filter((cam) => cam.id !== id) })),
    }),
    {
      name: "sermonsync-cameras",
      storage: createJSONStorage(() => getBrowserStorage()),
    },
  ),
);
