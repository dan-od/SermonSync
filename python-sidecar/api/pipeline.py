"""Scripture-matching pipeline endpoint (SS-021)."""

from __future__ import annotations

import time
from typing import Optional

from engine.matching.orchestrator import get_orchestrator
from engine.session.manager import get_manager
from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from ws_hub import manager as ws_manager

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


@router.post("/simulate")
async def simulate(req: MatchRequest) -> dict:
    """Inject a sentence into the LIVE pipeline as if it were transcribed —
    broadcasts a `sentence` event and the resulting `suggestions` over
    /ws/audio, and records to the active session. Lets the UI be tested
    end-to-end without a microphone.
    """
    ts = time.time()
    sentence = {
        "type": "sentence",
        "text": req.text,
        "timestamp": ts,
        "context": req.context or [],
    }
    await ws_manager.broadcast_json(sentence)
    get_manager().record_event("sentence", sentence)
    payload = await get_orchestrator().match_and_emit(req.text, req.context)
    return {"emitted": True, "suggestions": len(payload["results"])}
