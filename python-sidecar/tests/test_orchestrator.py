"""Unit tests for the 4-stage pipeline orchestrator (SS-021)."""

from __future__ import annotations

from engine.matching.orchestrator import PipelineOrchestrator, PipelineThresholds


class FakeMatcher:
    """Returns canned results and records whether it was invoked."""

    def __init__(self, results):
        self.results = results
        self.called = False

    def match(self, sentence, context=None):
        self.called = True
        return list(self.results)


def _res(book, ch, v, conf, stage):
    return {
        "book": book, "chapter": ch, "verse": v, "version": "KJV",
        "reference": f"{book} {ch}:{v}", "text": f"{book} {ch}:{v} text",
        "confidence": conf, "stage": stage,
    }


def test_stage1_short_circuits():
    trie = FakeMatcher([_res("John", 3, 16, 0.97, 1)])
    kw = FakeMatcher([_res("Mark", 1, 1, 0.9, 2)])
    orch = PipelineOrchestrator(trie=trie, keyword=kw,
                                llm=FakeMatcher([]), semantic=FakeMatcher([]))
    out = orch.match("for God so loved the world")
    assert out[0]["reference"] == "John 3:16"
    assert trie.called and not kw.called  # stage 2+ skipped


def test_cascades_to_keyword():
    trie = FakeMatcher([])
    kw = FakeMatcher([_res("Romans", 6, 23, 0.88, 2)])
    llm = FakeMatcher([_res("X", 1, 1, 0.9, 3)])
    orch = PipelineOrchestrator(trie=trie, keyword=kw, llm=llm, semantic=FakeMatcher([]))
    out = orch.match("the wages of sin")
    assert out[0]["reference"] == "Romans 6:23"
    assert kw.called and not llm.called


def test_falls_through_to_semantic():
    orch = PipelineOrchestrator(
        trie=FakeMatcher([]),
        keyword=FakeMatcher([_res("A", 1, 1, 0.4, 2)]),
        llm=FakeMatcher([]),
        semantic=FakeMatcher([_res("Psalms", 23, 1, 0.5, 4)]),
    )
    out = orch.match("thematic allusion")
    refs = [r["reference"] for r in out]
    assert "Psalms 23:1" in refs


def test_dedup_keeps_highest_confidence():
    orch = PipelineOrchestrator(
        trie=FakeMatcher([_res("John", 3, 16, 0.6, 1)]),
        keyword=FakeMatcher([_res("John", 3, 16, 0.9, 2)]),
        llm=FakeMatcher([]),
        semantic=FakeMatcher([]),
        thresholds=PipelineThresholds(keyword=0.85),
    )
    out = orch.match("...")
    john = [r for r in out if r["reference"] == "John 3:16"]
    assert len(john) == 1
    assert john[0]["confidence"] == 0.9
    assert john[0]["source_stages"] == [1, 2]


def test_min_confidence_filter():
    orch = PipelineOrchestrator(
        trie=FakeMatcher([]),
        keyword=FakeMatcher([]),
        llm=FakeMatcher([]),
        semantic=FakeMatcher([_res("Z", 1, 1, 0.1, 4)]),
        thresholds=PipelineThresholds(min_confidence=0.35),
    )
    assert orch.match("noise") == []


def test_payload_shape():
    orch = PipelineOrchestrator(
        trie=FakeMatcher([_res("John", 3, 16, 0.97, 1)]),
        keyword=FakeMatcher([]), llm=FakeMatcher([]), semantic=FakeMatcher([]),
    )
    payload = orch.build_payload("for God so loved the world")
    assert payload["type"] == "suggestions"
    r = payload["results"][0]
    assert set(r) >= {"reference", "text", "confidence", "stage", "version", "confidence_pct"}


def test_real_pipeline_end_to_end():
    """Real matchers (trie/keyword/llm mock) — an explicit quote resolves to
    John 3:16, detected by the trie (stage 1 among its sources)."""
    orch = PipelineOrchestrator(semantic=FakeMatcher([]))  # skip heavy S4
    out = orch.match("For God so loved the world")
    assert out[0]["reference"] == "John 3:16"
    assert 1 in out[0]["source_stages"]  # trie detected it
    assert out[0]["confidence"] >= 0.85
