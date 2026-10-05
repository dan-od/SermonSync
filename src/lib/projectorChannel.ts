import type { ProjectorOutputSnapshot } from "../types/state";

export type ProjectorChannelMessage =
  | { type: "state"; snapshot: ProjectorOutputSnapshot }
  | { type: "ready" }
  | { type: "ack"; revision: number }
  | { type: "templates-changed" };

const CHANNEL_NAME = "sermonsync-projector-v1";
const localSubscribers = new Set<(message: ProjectorChannelMessage) => void>();
let channel: BroadcastChannel | null = null;

function ensureChannel(): BroadcastChannel | null {
  if (channel) return channel;
  if (typeof BroadcastChannel === "undefined") return null;
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.addEventListener("message", (event: MessageEvent<ProjectorChannelMessage>) => {
    localSubscribers.forEach((subscriber) => subscriber(event.data));
  });
  return channel;
}

/**
 * Sends projector state between the operator and output webviews without a
 * long-lived native callback. Browser channels are discarded automatically
 * when a webview reloads, so Rust cannot call an identifier from the previous
 * JavaScript context.
 */
export function postProjectorChannelMessage(message: ProjectorChannelMessage): void {
  const activeChannel = ensureChannel();
  if (activeChannel) {
    activeChannel.postMessage(message);
    return;
  }

  // Test/browser fallback. A normal Tauri webview has BroadcastChannel.
  queueMicrotask(() => localSubscribers.forEach((subscriber) => subscriber(message)));
}

export function subscribeProjectorChannel(
  subscriber: (message: ProjectorChannelMessage) => void,
): () => void {
  localSubscribers.add(subscriber);
  ensureChannel();
  return () => {
    localSubscribers.delete(subscriber);
    if (localSubscribers.size === 0 && channel) {
      channel.close();
      channel = null;
    }
  };
}

function disposeProjectorChannel(): void {
  localSubscribers.clear();
  channel?.close();
  channel = null;
}

if (import.meta.hot) {
  import.meta.hot.dispose(disposeProjectorChannel);
}
