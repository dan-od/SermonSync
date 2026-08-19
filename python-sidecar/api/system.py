"""System status / latency / engine / connectivity endpoints
(SS-015 latency, SS-049 engine version, SS-048 sync/offline)."""

from __future__ import annotations

from engine.config.store import get_store
from engine.health import system_health
from engine.monitoring import monitor
from engine.version import ENGINE_VERSION, pipeline_config
from fastapi import APIRouter

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/status")
def system_status() -> dict:
    """Latency stats, uptime, and pipeline health."""
    return monitor.status()


@router.get("/engine")
def engine_info() -> dict:
    """Engine version + configured pipeline (SS-049)."""
    return pipeline_config()


@router.get("/health")
def health() -> dict:
    """Per-component health + graceful-degradation status (SS-055)."""
    return system_health()


@router.get("/connectivity")
def connectivity() -> dict:
    """Sync / offline-first / Groq-linked indicators (SS-048).

    SermonSync is offline-first: all core functionality works with no network.
    Cloud sync is optional archive backup (not yet enabled). Groq-linked reflects
    whether a cloud LLM fallback is configured (SS-050).
    """
    store = get_store()
    groq_linked = bool(store.get_setting("groq_enabled", False)) and bool(
        store.get_setting("groq_api_key")
    )
    sync_enabled = bool(store.get_setting("sync_enabled", False))
    return {
        "engine_version": ENGINE_VERSION,
        "offline_first": True,
        "sync_enabled": sync_enabled,
        "sync_status": "synced" if sync_enabled else "offline",
        "groq_linked": groq_linked,
    }
