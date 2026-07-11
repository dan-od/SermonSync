"""Latency monitoring and system status (SS-015).

Tracks end-to-end and per-stage latencies, uptime, and pipeline health, and
broadcasts a periodic system_status event. Latency above ALERT_THRESHOLD_MS is
flagged.
"""

from __future__ import annotations

import logging
import time
from collections import deque

logger = logging.getLogger("sermonsync.monitoring")

ALERT_THRESHOLD_MS = 2000

# The four top-level pipeline stages surfaced in the health array.
PIPELINE_STAGES = ["capture", "transcription", "matching", "projection"]


class StageStats:
    def __init__(self, maxlen: int = 100) -> None:
        self.latencies: deque[float] = deque(maxlen=maxlen)
        self.last_active: float | None = None
        self.error_count = 0
        self.healthy = True

    def record(self, ms: float) -> None:
        self.latencies.append(ms)
        self.last_active = time.time()

    def avg(self) -> float:
        return sum(self.latencies) / len(self.latencies) if self.latencies else 0.0

    def last(self) -> float:
        return self.latencies[-1] if self.latencies else 0.0

    def max(self) -> float:
        return max(self.latencies) if self.latencies else 0.0


class Monitor:
    def __init__(self) -> None:
        self._start = time.time()
        self._e2e: deque[float] = deque(maxlen=100)
        self._stages: dict[str, StageStats] = {s: StageStats() for s in PIPELINE_STAGES}

    def reset(self) -> None:
        self._start = time.time()
        self._e2e.clear()
        for s in self._stages.values():
            s.latencies.clear()
            s.error_count = 0
            s.healthy = True
            s.last_active = None

    def record_stage(self, stage: str, ms: float) -> None:
        if stage in self._stages:
            self._stages[stage].record(ms)

    def touch(self, stage: str) -> None:
        if stage in self._stages:
            self._stages[stage].last_active = time.time()

    def record_end_to_end(self, ms: float) -> None:
        self._e2e.append(ms)

    def flag_error(self, stage: str) -> None:
        if stage in self._stages:
            self._stages[stage].error_count += 1
            self._stages[stage].healthy = False

    def clear_error(self, stage: str) -> None:
        if stage in self._stages:
            self._stages[stage].healthy = True

    def uptime_seconds(self) -> int:
        return int(time.time() - self._start)

    def _e2e_last(self) -> float:
        return self._e2e[-1] if self._e2e else 0.0

    def status(self) -> dict:
        last = self._e2e_last()
        avg = sum(self._e2e) / len(self._e2e) if self._e2e else 0.0
        peak = max(self._e2e) if self._e2e else 0.0
        if last == 0:
            health = "idle"
        elif last > ALERT_THRESHOLD_MS:
            health = "alert"
        elif last > ALERT_THRESHOLD_MS * 0.6:
            health = "degraded"
        else:
            health = "stable"
        return {
            "uptime_seconds": self.uptime_seconds(),
            "latency_ms": int(last),
            "latency_avg_ms": int(avg),
            "latency_peak_ms": int(peak),
            "status": health,
            "alert": last > ALERT_THRESHOLD_MS,
            "pipeline_stages_healthy": [self._stages[s].healthy for s in PIPELINE_STAGES],
            "stages": {
                name: {
                    "avg_ms": int(st.avg()),
                    "last_ms": int(st.last()),
                    "max_ms": int(st.max()),
                    "errors": st.error_count,
                    "healthy": st.healthy,
                }
                for name, st in self._stages.items()
            },
        }


monitor = Monitor()


async def status_emitter(interval: float = 5.0) -> None:
    """Broadcast system_status over the WS hub every `interval` seconds."""
    import asyncio

    from ws_hub import manager

    while True:
        await asyncio.sleep(interval)
        payload = {"type": "system_status", **monitor.status()}
        if payload["latency_ms"] > ALERT_THRESHOLD_MS:
            logger.warning("latency alert: %d ms", payload["latency_ms"])
        await manager.broadcast_json(payload)
