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


def _orch(spoken=None, spoken_only=True):
    stages = {k: Never() for k in ("trie", "keyword", "llm", "semantic")}
    orch = PipelineOrchestrator(
        spoken=spoken or SpokenReferenceMatcher(), spoken_only=spoken_only, **stages
    )
    return orch, stages


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
    orch, stages = _orch(spoken_only=False)
    assert orch.match("the wages of sin is death") == []
    assert stages["trie"].called and stages["keyword"].called


def test_spoken_only_stops_after_stage0():
    orch, stages = _orch()
    assert orch.match("the wages of sin is death") == []
    assert not any(s.called for s in stages.values())


def test_spoken_only_match_and_emit_skips_broad_matching(emitted):
    orch, stages = _orch()
    payload = asyncio.run(orch.match_and_emit("the wages of sin is death", None, 0.0))
    assert payload["results"] == []
    assert emitted == []
    assert not any(s.called for s in stages.values())


def test_broad_mode_match_and_emit_runs_the_cascade(emitted):
    orch, stages = _orch(spoken_only=False)
    asyncio.run(orch.match_and_emit("the wages of sin is death", None, 0.0))
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


def test_fragment_matching_splits_and_repeats_yield_one_card(emitted):
    """SS-078: Stage 0 runs per final fragment, not per assembled sentence.

    The live window has to carry a reference across the fragment boundary and
    then refuse to suggest it twice — once for the fragment, and again for the
    sentence those fragments assemble into.
    """
    orch, _ = _orch()

    async def scenario():
        # Split across two fragments: the book and chapter, then the verse.
        await orch.match_fragment_and_emit("turn with me to John chapter three", 1000.0)
        await orch.match_fragment_and_emit("verse sixteen", 1001.0)
        # The assembled sentence arrives a moment later over the same window.
        # Same clock as the fragments: the tracker dedupes inside a 15 s
        # window, so a mixed fake/real timestamp here would look like a
        # different service and emit again.
        await orch.match_and_emit(
            "turn with me to John chapter three verse sixteen", timestamp=1001.5
        )
        # And the preacher says it again.
        await orch.match_fragment_and_emit("John chapter three verse sixteen", 1002.0)

    asyncio.run(scenario())

    cards = [r["reference"] for p in emitted for r in p["results"]]
    assert cards == ["John 3:16"], f"expected exactly one card, got {cards}"


def test_fragment_matching_stays_quiet_without_a_reference(emitted):
    """A half-phrase that names no verse must not emit on a guess."""
    orch, stages = _orch()

    async def scenario():
        await orch.match_fragment_and_emit("and so the Lord said to them", 1000.0)

    asyncio.run(scenario())
    assert emitted == []
    assert not any(s.called for s in stages.values())

