"""Sermon context / theme detection (SS-022).

Analyzes the rolling transcript context and surfaces 1-3 high-level themes
(e.g. "DIVINE SALVATION", "ETERNAL HOPE") that get displayed on suggestion
cards to explain why scriptures were matched.

Updates periodically (every N sentences) or on a significant topic shift.

Uses a keyword lexicon by default (deterministic, no model). SS-019 currently
runs a mock LLM; when a real LLM is configured, `use_llm=True` could route theme
extraction through it — the lexicon remains the fast/offline fallback.
"""

from __future__ import annotations

import logging
from collections import deque

from engine.matching.text_utils import stems

logger = logging.getLogger("sermonsync.context")

# Theme label -> trigger words (matched after stemming/normalization).
THEME_LEXICON: dict[str, set[str]] = {
    "DIVINE SALVATION": {
        "salvation", "saved", "save", "saviour", "redeem", "redemption",
        "cross", "blood", "atonement", "gospel", "deliver", "ransom",
    },
    "ETERNAL HOPE": {
        "hope", "eternal", "everlasting", "heaven", "resurrection", "promise",
        "glory", "forever", "inherit", "reward",
    },
    "FAITH & WORKS": {
        "faith", "believe", "work", "deed", "obedience", "trust", "walk",
        "fruit", "labour",
    },
    "JUDGEMENT & MERCY": {
        "judgment", "judgement", "judge", "mercy", "wrath", "forgive",
        "repent", "righteous", "condemn", "justice",
    },
    "LOVE & GRACE": {
        "love", "grace", "compassion", "kindness", "charity", "gift", "mercy",
    },
    "SIN & REPENTANCE": {
        "sin", "repent", "iniquity", "transgression", "confess", "guilt",
        "wicked",
    },
    "PRAYER & WORSHIP": {
        "pray", "prayer", "worship", "praise", "thanksgiving", "glorify",
        "adore",
    },
}


class ContextDetector:
    def __init__(self, update_every: int = 5, window: int = 10, use_llm: bool = False) -> None:
        self.update_every = update_every
        self.use_llm = use_llm
        self._recent: deque[str] = deque(maxlen=window)
        self._count = 0
        self._last_themes: list[str] = []

    @property
    def current_themes(self) -> list[str]:
        return list(self._last_themes)

    def reset(self) -> None:
        self._recent.clear()
        self._count = 0
        self._last_themes = []

    def detect(self, text: str) -> dict:
        """Score themes over `text`; returns {themes, confidence, scores}."""
        words = stems(text)
        wordset = set(words)
        scores: dict[str, int] = {}
        for theme, triggers in THEME_LEXICON.items():
            hits = len(wordset & triggers)
            if hits:
                scores[theme] = hits
        if not scores:
            return {"themes": [], "confidence": 0.0, "scores": {}}
        ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
        themes = [t for t, _ in ranked[:3]]
        top = ranked[0][1]
        confidence = round(min(0.95, 0.55 + 0.1 * top), 4)
        return {"themes": themes, "confidence": confidence, "scores": scores}

    def feed(self, sentence: str) -> dict | None:
        """Add a sentence; returns a context_update payload when it's time to
        refresh themes (every `update_every` sentences or on a topic shift)."""
        self._recent.append(sentence)
        self._count += 1

        due = self._count % self.update_every == 0
        # Peek for a significant shift (primary theme changed) so we can update
        # early — but not on every minor re-ranking.
        result = self.detect(" ".join(self._recent))
        shifted = bool(result["themes"]) and (
            not self._last_themes or result["themes"][0] != self._last_themes[0]
        )

        if not (due or shifted):
            return None
        if not result["themes"]:
            return None
        self._last_themes = result["themes"]
        return {
            "type": "context_update",
            "themes": result["themes"],
            "confidence": result["confidence"],
        }


_detector = ContextDetector()


def get_detector() -> ContextDetector:
    return _detector
