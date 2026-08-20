#!/usr/bin/env node
import WebSocket from "ws";

const httpBase = process.env.SIDECAR_HTTP_BASE ?? "http://127.0.0.1:8000";
const wsBase = process.env.SIDECAR_WS_BASE ?? "ws://127.0.0.1:8000/ws/audio";
const durationMs = Number.parseInt(process.argv[2] ?? "10000", 10);

async function fetchJson(path) {
  const response = await fetch(`${httpBase}${path}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${path} failed (${response.status}): ${text}`);
  }
  return response.json();
}

async function main() {
  console.log(`[smoke] sidecar http base: ${httpBase}`);
  console.log(`[smoke] sidecar ws base: ${wsBase}`);

  const health = await fetchJson("/health");
  console.log("[smoke] /health", health);

  const status = await fetchJson("/api/status");
  console.log("[smoke] /api/status", status);

  try {
    const devices = await fetchJson("/api/audio/devices?refresh=false");
    console.log("[smoke] /api/audio/devices count", devices.count);
  } catch (error) {
    console.log("[smoke] /api/audio/devices unavailable", String(error));
  }

  const eventCounts = new Map();

  await new Promise((resolve, reject) => {
    const ws = new WebSocket(wsBase);
    let settled = false;

    const finish = (err) => {
      if (settled) {
        return;
      }
      settled = true;
      ws.close();
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    };

    ws.on("open", () => {
      console.log("[smoke] ws connected");
      ws.send("smoke-test");
      setTimeout(() => finish(), durationMs);
    });

    ws.on("message", (raw) => {
      if (typeof raw !== "string" && !Buffer.isBuffer(raw)) {
        return;
      }
      const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : raw;
      try {
        const payload = JSON.parse(text);
        if (payload && typeof payload.type === "string") {
          eventCounts.set(payload.type, (eventCounts.get(payload.type) ?? 0) + 1);
        }
      } catch {
        // Binary pcm frames and non-json messages are expected.
      }
    });

    ws.on("error", (error) => {
      finish(new Error(`ws error: ${String(error)}`));
    });
  });

  console.log("[smoke] event summary");
  for (const [type, count] of [...eventCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  - ${type}: ${count}`);
  }

  if (!eventCounts.has("ack")) {
    throw new Error("ws did not receive ack event");
  }

  console.log("[smoke] success");
}

main().catch((error) => {
  console.error("[smoke] failed", error);
  process.exitCode = 1;
});
