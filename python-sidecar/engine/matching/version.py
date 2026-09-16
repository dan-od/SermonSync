"""Active Bible version shared by the live scripture matchers."""

from __future__ import annotations

import os

DEFAULT_VERSION = "ENGLISHNKJ"
_env_version = os.environ.get("SERMONSYNC_BIBLE_VERSION", DEFAULT_VERSION)
_active_version = _env_version.strip().upper() or DEFAULT_VERSION


def get_active_version() -> str:
    return _active_version


def set_active_version(version: str) -> str:
    global _active_version
    normalized = version.strip().upper()
    if not normalized:
        raise ValueError("Bible version cannot be empty")
    _active_version = normalized
    return _active_version
