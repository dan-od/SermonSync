"""Sermon archive & session history endpoints (SS-045).

Builds on the session_events recorded during a session (SS-044): full
transcript, generated suggestions, and operator actions, all searchable, plus
the archive-duration summary for the status bar.
"""

from __future__ import annotations

from typing import Optional

from engine.config.store import get_store
from engine.matching.groq_matcher import DEFAULT_GROQ_MODEL, GroqMatcher
from engine.session.manager import get_manager
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter(prefix="/api/archive", tags=["archive"])


@router.get("/summary")
def archive_summary() -> dict:
    """Totals for the status-bar ARCHIVE indicator (duration + counts)."""
    summary = get_manager().archive_summary()
    total = summary["total_seconds"]
    hours, rem = divmod(total, 3600)
    minutes = rem // 60
    summary["duration_label"] = f"{hours}h{minutes:02d}m"
    return summary


@router.get("/sessions")
def list_sessions(limit: int = Query(50, ge=1, le=200)) -> dict:
    sessions = get_manager().history(limit=limit)
    return {"count": len(sessions), "sessions": sessions}


@router.get("/search")
def search_archive(q: str = Query(..., min_length=2), limit: int = Query(25, ge=1, le=100)) -> dict:
    results = get_manager().search_transcripts(q, limit=limit)
    return {"query": q, "count": len(results), "results": results}


@router.get("/sessions/{session_id}")
def get_archive(session_id: str) -> dict:
    archive = get_manager().full_archive(session_id)
    if archive is None:
        raise HTTPException(status_code=404, detail=f"unknown session '{session_id}'")
    return archive


class ActionRequest(BaseModel):
    action: str  # sent | dismissed | edited
    reference: Optional[str] = None
    detail: Optional[dict] = None


class SummaryRequest(BaseModel):
    title: str = ""
    draft: str = ""
    generated: str = ""


@router.get("/sessions/{session_id}/summary")
def get_session_summary(session_id: str) -> dict:
    manager = get_manager()
    if manager.get(session_id) is None:
        raise HTTPException(status_code=404, detail=f"unknown session '{session_id}'")
    return {"summary": manager.get_summary(session_id)}


@router.put("/sessions/{session_id}/summary")
def save_session_summary(session_id: str, req: SummaryRequest) -> dict:
    try:
        summary = get_manager().save_summary(session_id, req.title, req.draft, req.generated)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"summary": summary}


class FormatRequest(BaseModel):
    content: str
    format: str


@router.post("/format")
def format_archive(req: FormatRequest) -> dict:
    """Format an operator-edited summary for its selected export format."""
    if req.format not in {"md", "txt"}:
        raise HTTPException(status_code=400, detail="format must be md or txt")
    store = get_store()
    api_key = store.get_setting("groq_api_key")
    if not store.get_setting("groq_enabled", False) or not api_key:
        raise HTTPException(status_code=503, detail="Groq formatting is unavailable")
    model = store.get_setting("groq_model", DEFAULT_GROQ_MODEL)
    instruction = (
        "Format the following church service summary as clean Markdown. "
        "Preserve its meaning and do not add facts. "
        "Use headings and readable bullet lists. Return only the document."
        if req.format == "md"
        else "Format the following church service summary as clean plain text. "
        "Preserve its meaning and do not add facts. "
        "Use simple uppercase section headings and readable bullets. Return only the document."
    )
    try:
        formatted = GroqMatcher(api_key=api_key, model=model, max_tokens=1800)._call(
            f"{instruction}\n\n{req.content}"
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Groq formatting failed: {exc}") from exc
    return {"content": formatted.strip(), "format": req.format, "model": model}


@router.post("/action")
def record_action(req: ActionRequest) -> dict:
    """Record an operator action (sent/dismissed/edited) on the active session."""
    mgr = get_manager()
    if mgr.current_id is None:
        raise HTTPException(status_code=409, detail="no active session")
    payload = {"action": req.action, "reference": req.reference, "detail": req.detail}
    mgr.record_event("action", payload)
    return {"recorded": True, "session_id": mgr.current_id, "action": req.action}
