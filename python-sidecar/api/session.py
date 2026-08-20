"""Session lifecycle endpoints (SS-044).

Fixes the /api/session/* 404s the frontend sessionStore expects and persists
session data for the archive (SS-045).
"""

from __future__ import annotations

from typing import Optional

from engine.session.manager import get_manager
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ws_hub import manager as ws_manager

router = APIRouter(prefix="/api/session", tags=["session"])


class StartSessionRequest(BaseModel):
    unit_id: Optional[str] = None
    unit_name: Optional[str] = None


async def _broadcast(session: Optional[dict]) -> None:
    await ws_manager.broadcast_json({"type": "session_update", "session": session})


@router.post("/start")
async def start_session(req: StartSessionRequest) -> dict:
    session = get_manager().start(unit_id=req.unit_id, unit_name=req.unit_name)
    await _broadcast(session)
    return session


@router.post("/end")
async def end_session() -> dict:
    session = get_manager().end()
    if session is None:
        raise HTTPException(status_code=409, detail="no active session")
    await _broadcast(None)
    return session


@router.get("/current")
def current_session() -> dict:
    return {"session": get_manager().current()}


@router.get("/history")
def session_history(limit: int = 50) -> dict:
    sessions = get_manager().history(limit=limit)
    return {"count": len(sessions), "sessions": sessions}


@router.get("/{session_id}")
def get_session(session_id: str) -> dict:
    session = get_manager().get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"unknown session '{session_id}'")
    return session
