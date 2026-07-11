"""Scripture-matching pipeline endpoint (SS-021)."""

from __future__ import annotations

from typing import Optional

from engine.matching.orchestrator import get_orchestrator
from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])


class MatchRequest(BaseModel):
    text: str
    context: Optional[list[str]] = None


@router.post("/match")
async def match(req: MatchRequest) -> dict:
    """Run the 4-stage pipeline on `text` (+ optional context sentences)."""
    orch = get_orchestrator()
    # Stages are CPU-bound (and may load models) — keep the event loop free.
    return await run_in_threadpool(orch.build_payload, req.text, req.context)
