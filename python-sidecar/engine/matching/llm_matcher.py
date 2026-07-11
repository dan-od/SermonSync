"""Stage 3 — Contextual LLM matcher (SS-019).

Uses a local GGUF LLM (via llama-cpp-python) to catch paraphrases and allusions
the lexical stages miss, reasoning over the current sentence plus the rolling
context window. This is the expensive stage — the orchestrator only invokes it
when Stages 1-2 are low-confidence.

MODEL: not bundled in this build session (Qwen3-30B is ~18 GB; even a small GGUF
is a large download). A heuristic MockLLMMatcher runs instead so the pipeline is
exercised end-to-end.

--- To enable the real model -------------------------------------------------
  1. pip install llama-cpp-python
  2. Download a GGUF, e.g. Qwen2.5-3B-Instruct-Q4_K_M.gguf (or Qwen3-30B for the
     production target) into python-sidecar/models/
  3. Set env LLM_MODEL_PATH=models/<file>.gguf  (optionally LLM_N_GPU_LAYERS,
     LLM_CONTEXT_LENGTH, LLM_TEMPERATURE, LLM_MAX_TOKENS)
  get_matcher() then loads LlamaCppMatcher automatically.
-----------------------------------------------------------------------------
"""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass

from engine.bible.lookup import fetch_verse

logger = logging.getLogger("sermonsync.matching.llm")

PROMPT_TEMPLATE = (
    "You are a scripture reference detector for a live sermon assistant.\n"
    "Given this sermon transcript excerpt, identify any Bible scripture "
    "references — direct quotes, paraphrases, or allusions.\n"
    "Return ONLY a JSON array of objects with keys book, chapter, verse, "
    "confidence (0-1). Empty array if none.\n\n"
    "Context (earlier sentences):\n{context}\n\n"
    "Current sentence:\n{sentence}\n\nJSON:"
)


@dataclass
class LLMConfig:
    model_path: str | None = os.environ.get("LLM_MODEL_PATH")
    context_length: int = int(os.environ.get("LLM_CONTEXT_LENGTH", "4096"))
    temperature: float = float(os.environ.get("LLM_TEMPERATURE", "0.1"))
    max_tokens: int = int(os.environ.get("LLM_MAX_TOKENS", "256"))
    n_gpu_layers: int = int(os.environ.get("LLM_N_GPU_LAYERS", "0"))


def _hydrate(refs: list[dict], stage: int) -> list[dict]:
    """Validate refs against the DB and attach verse text; drop invalid ones."""
    out = []
    for r in refs:
        try:
            book = str(r["book"])
            chapter = int(r["chapter"])
            verse = int(r["verse"])
        except (KeyError, ValueError, TypeError):
            continue
        hydrated = fetch_verse(book, chapter, verse)
        if hydrated is None:
            continue
        hydrated["confidence"] = round(float(r.get("confidence", 0.75)), 4)
        hydrated["stage"] = stage
        out.append(hydrated)
    return out


class LlamaCppMatcher:
    """Real backend — loads a GGUF model via llama-cpp-python."""

    stage = 3
    is_mock = False

    def __init__(self, llama, config: LLMConfig) -> None:
        self._llama = llama
        self.config = config

    @classmethod
    def load(cls, config: LLMConfig) -> LlamaCppMatcher:
        from llama_cpp import Llama

        if not config.model_path or not os.path.exists(config.model_path):
            raise FileNotFoundError(f"LLM model not found: {config.model_path}")
        llama = Llama(
            model_path=config.model_path,
            n_ctx=config.context_length,
            n_gpu_layers=config.n_gpu_layers,
            verbose=False,
        )
        logger.info("LLM matcher loaded: %s", config.model_path)
        return cls(llama, config)

    def match(self, sentence: str, context: list[str] | None = None) -> list[dict]:
        prompt = PROMPT_TEMPLATE.format(
            context="\n".join(context or []) or "(none)", sentence=sentence
        )
        resp = self._llama(
            prompt,
            max_tokens=self.config.max_tokens,
            temperature=self.config.temperature,
            stop=["\n\n"],
        )
        text = resp["choices"][0]["text"]
        return _hydrate(_parse_refs(text), self.stage)


# Known paraphrases/allusions for the heuristic fallback. Keyed by distinctive
# phrases; value is (book, chapter, verse, confidence).
_ALLUSIONS = {
    "prodigal son": ("Luke", 15, 11, 0.72),
    "good samaritan": ("Luke", 10, 33, 0.72),
    "mustard seed": ("Matthew", 17, 20, 0.75),
    "truth shall set you free": ("John", 8, 32, 0.85),
    "truth will set you free": ("John", 8, 32, 0.85),
    "i can do all things": ("Philippians", 4, 13, 0.88),
    "valley of the shadow of death": ("Psalms", 23, 4, 0.9),
    "faith without works": ("James", 2, 26, 0.82),
    "wages of sin": ("Romans", 6, 23, 0.85),
    "love your neighbor": ("Mark", 12, 31, 0.8),
    "love your neighbour": ("Mark", 12, 31, 0.8),
    "for god so loved": ("John", 3, 16, 0.95),
    "the lord is my shepherd": ("Psalms", 23, 1, 0.95),
    "in the beginning god": ("Genesis", 1, 1, 0.9),
    "be still and know": ("Psalms", 46, 10, 0.85),
    "greater love hath no man": ("John", 15, 13, 0.85),
    "fearfully and wonderfully made": ("Psalms", 139, 14, 0.85),
    "all things work together for good": ("Romans", 8, 28, 0.85),
}


class MockLLMMatcher:
    """Heuristic stand-in: phrase-allusion lookup over sentence + context."""

    stage = 3
    is_mock = True

    def match(self, sentence: str, context: list[str] | None = None) -> list[dict]:
        haystack = " ".join([*(context or []), sentence]).lower()
        refs = []
        for phrase, (book, chapter, verse, conf) in _ALLUSIONS.items():
            if phrase in haystack:
                refs.append(
                    {"book": book, "chapter": chapter, "verse": verse, "confidence": conf}
                )
        return _hydrate(refs, self.stage)


def _parse_refs(text: str) -> list[dict]:
    """Extract a JSON array of refs from a model response, tolerantly."""
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if not match:
        return []
    try:
        data = json.loads(match.group(0))
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


_matcher = None


def get_matcher():
    """Return the LLM matcher — real if a model is configured, else the mock."""
    global _matcher
    if _matcher is not None:
        return _matcher
    config = LLMConfig()
    try:
        if config.model_path:
            _matcher = LlamaCppMatcher.load(config)
            return _matcher
    except Exception as exc:
        logger.warning("LLM real backend unavailable (%s); using mock", exc)
    _matcher = MockLLMMatcher()
    logger.info("using MockLLMMatcher (heuristic allusion lookup)")
    return _matcher


def set_matcher(matcher) -> None:
    global _matcher
    _matcher = matcher
