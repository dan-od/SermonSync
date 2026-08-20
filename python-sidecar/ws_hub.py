"""Shared WebSocket broadcast hub.

Engine components (audio capture, VAD, transcription, matching, monitoring)
push events to all connected clients through a single manager instance so they
don't each need to track sockets.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger("sermonsync.ws")


class ConnectionManager:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._lock: asyncio.Lock | None = None

    def _get_lock(self) -> asyncio.Lock:
        # Create the lock lazily so it binds to the running event loop rather
        # than whichever loop existed at construction time (Python 3.9).
        if self._lock is None:
            self._lock = asyncio.Lock()
        return self._lock

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._get_lock():
            self._clients.add(ws)
        logger.info("ws client connected (%d total)", len(self._clients))

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._get_lock():
            self._clients.discard(ws)
        logger.info("ws client disconnected (%d total)", len(self._clients))

    @property
    def client_count(self) -> int:
        return len(self._clients)

    async def broadcast_json(self, payload: dict[str, Any]) -> None:
        """Send a JSON payload to every connected client, dropping dead ones."""
        dead: list[WebSocket] = []
        for ws in list(self._clients):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._get_lock():
                for ws in dead:
                    self._clients.discard(ws)

    async def broadcast_bytes(self, data: bytes) -> None:
        dead: list[WebSocket] = []
        for ws in list(self._clients):
            try:
                await ws.send_bytes(data)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._get_lock():
                for ws in dead:
                    self._clients.discard(ws)


# Singleton used across the app.
manager = ConnectionManager()
