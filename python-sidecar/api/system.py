"""System status / latency endpoints (SS-015)."""

from __future__ import annotations

from engine.monitoring import monitor
from fastapi import APIRouter

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/status")
def system_status() -> dict:
    """Latency stats, uptime, and pipeline health."""
    return monitor.status()
