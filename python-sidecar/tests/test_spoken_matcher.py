"""Stage 0: explicitly spoken references, live and in the cascade."""

from __future__ import annotations

import asyncio

import pytest
from engine.matching import orchestrator as orch_mod
from engine.matching.orchestrator import PipelineOrchestrator
from engine.matching.spoken_matcher import SpokenReferenceMatcher


class Never:
    """A later stage that must not run."""

    def __init__(self):
        self.called = False

    def match(self, sentence, context=None):
        self.called = True
        return []


@pytest.fixture
def emitted(monkeypatch):
    sent = []

    async def capture(self, payload):
        sent.append(payload)

    monkeypatch.setattr(PipelineOrchestrator, "_emit", capture)
    return sent


def _orch(spoken=None):
    stages = {k: Never() for k in ("trie", "keyword", "llm", "semantic")}
    return PipelineOrchestrator(spoken=spoken or SpokenReferenceMatcher(), **stages), stages


def test_hydrates_verse_text_and_ranges():
    m = SpokenReferenceMatcher()
    (r,) = m.match("turn with me to John chapter three verse sixteen")
    assert r["reference"] == "John 3:16" and r["stage"] == 0
    assert "loved the world" in r["text"]
    assert r["confidence"] == pytest.approx(0.95)
    (r,) = m.match("first Corinthians 13 4 through 7")
    assert r["reference"] == "1 Corinthians 13:4-7"
    assert r["verse"] == 4 and r["verse_end"] == 7
    assert r["text"].count(" ") > 30  # four verses joined


def test_context_carry_over_in_stateless_match():
    m = SpokenReferenceMatcher()
    (r,) = m.match("Look at verse 17.", context=["Let's go to John chapter 3."])
    assert r["reference"] == "John 3:17"


def test_stage0_short_circuits_the_cascade():
    orch, stages = _orch()
    out = orch.match("Romans 8:28 says all things work together")
    assert [r["reference"] for r in out] == ["Romans 8:28"]
    assert not any(s.called for s in stages.values())


def test_no_reference_falls_through():
    orch, stages = _orch()
    assert orch.match("the wages of sin is death") == []
    assert stages["trie"].called and stages["keyword"].called


def test_live_split_reference_is_one_suggestion(emitted):
    orch, stages = _orch()

    async def run():
        await orch.match_and_emit("Open your Bibles to John three", None, 100.0)
        await orch.match_and_emit("sixteen. For God so loved the world.", None, 103.0)
        await orch.match_and_emit("John 3:16 is the gospel in a nutshell.", None, 106.0)

    asyncio.run(run())
    refs = [r["reference"] for p in emitted for r in p["results"]]
    assert refs == ["John 3:16"]
    assert emitted[0]["results"][0]["stage"] == 0


def test_live_carry_over_survives_substance_filter(emitted):
    orch, _ = _orch()

    async def run():
        await orch.match_and_emit("Romans chapter eight.", None, 10.0)
        await orch.match_and_emit("Verse 28.", None, 12.0)

    asyncio.run(run())
    assert orch_mod.has_substance("Verse 28.") is False
    assert [r["reference"] for p in emitted for r in p["results"]] == ["Romans 8:28"]


def test_repeated_reference_does_not_reach_guessing_stages(emitted):
    orch, stages = _orch()

    async def run():
        await orch.match_and_emit("John 3:16", None, 0.0)
        await orch.match_and_emit("Again, John 3:16 tells us God loved the world.", None, 5.0)

    asyncio.run(run())
    assert len(emitted) == 1
    assert not any(s.called for s in stages.values())


def test_asr_damaged_reference_live(emitted):
    orch, _ = _orch()
    asyncio.run(orch.match_and_emit("Let us go to Romans 828, and we know", None, 0.0))
    assert [r["reference"] for p in emitted for r in p["results"]] == ["Romans 8:28"]
