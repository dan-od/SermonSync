"""Shared text normalization for the scripture matchers (SS-017..020)."""

from __future__ import annotations

import re

# KJV editorial markers in the dataset: [A Psalm of David.] titles, {supplied}
# italic words. Drop bracketed annotations entirely; keep the words inside {}.
_ANNOTATION = re.compile(r"\[[^\]]*\]")
_NON_ALNUM = re.compile(r"[^a-z0-9\s]")
_WS = re.compile(r"\s+")

# Common English stopwords (SS-018 keyword matcher filters these).
STOPWORDS = frozenset([
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
    "had", "has", "have", "he", "her", "his", "i", "in", "is", "it",
    "its", "of", "on", "or", "that", "the", "their", "them", "they", "this",
    "to", "was", "were", "will", "with", "you", "your", "unto", "shall", "thou",
    "thee", "thy", "ye", "himself", "which", "but", "not", "so", "all", "we",
    "our", "us", "my", "me",
])


def normalize_text(text: str) -> str:
    """Lowercase, drop annotations/punctuation, collapse whitespace."""
    text = _ANNOTATION.sub(" ", text)
    text = text.replace("{", " ").replace("}", " ")
    text = text.lower()
    text = _NON_ALNUM.sub(" ", text)
    return _WS.sub(" ", text).strip()


def normalize_words(text: str) -> list[str]:
    norm = normalize_text(text)
    return norm.split() if norm else []


def content_words(text: str) -> list[str]:
    """Normalized words with stopwords removed (for keyword indexing)."""
    return [w for w in normalize_words(text) if w not in STOPWORDS]


# American -> KJV British spellings, so paraphrases match the KJV text.
_SPELLING = {
    "neighbor": "neighbour",
    "savior": "saviour",
    "honor": "honour",
    "favor": "favour",
    "labor": "labour",
    "color": "colour",
    "glorious": "glorious",
}


def stem(word: str) -> str:
    """Very conservative stem: spelling-normalize + strip a plural 's'.

    Deliberately light — aggressive suffix stripping mangles short words
    (dead -> de), so we only fold obvious plurals (works -> work).
    """
    w = _SPELLING.get(word, word)
    if len(w) > 4 and w.endswith("s") and not w.endswith(("ss", "us", "is", "ous")):
        w = w[:-1]
    return w


def stems(text: str) -> list[str]:
    """Content-word stems for keyword indexing/matching."""
    return [stem(w) for w in content_words(text)]
