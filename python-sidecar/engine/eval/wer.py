"""WER scoring: normalization, references and jiwer wrappers (SS-072)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import jiwer

from . import captions as cap
from .detection_scoring import Expected
from .intervals import merge
from .run_data import Run

try:
    from whisper_normalizer.english import EnglishTextNormalizer

    _normalizer = EnglishTextNormalizer()
    NORMALIZER = "whisper EnglishTextNormalizer"
except ImportError:  # pragma: no cover
    _normalizer = None
    NORMALIZER = "basic (whisper-normalizer not installed)"


SIDECAR_DIR = Path(__file__).resolve().parents[2]


REFERENCES_DIR = SIDECAR_DIR / "eval" / "references"


def normalize(text: str) -> str:
    if _normalizer is not None:
        return re.sub(r"\s+", " ", _normalizer(text)).strip()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9' ]", " ", text.lower())).strip()


# ---------------------------------------------------------------------------
# References
# ---------------------------------------------------------------------------


@dataclass
class Reference:
    source: str  # reference.txt | human captions | auto captions
    label: str
    text: str
    start: float
    end: float
    # Spans scored, when not just [start, end] (a seeked run).
    spans: list[list[float]] | None = None

    @property
    def segments(self) -> list[list[float]]:
        return self.spans if self.spans is not None else [[self.start, self.end]]


def _find_file(run: Run, name: str) -> Path | None:
    local = run.run_dir / name
    if local.is_file():
        return local
    source_id = (run.meta.get("source") or {}).get("source_id")
    for key in filter(None, [run.meta.get("request", {}).get("label"), source_id]):
        candidate = REFERENCES_DIR / key / name
        if candidate.is_file():
            return candidate
    return None


def load_reference_txt(path: Path, run: Run) -> Reference:
    lines = path.read_text(encoding="utf-8").splitlines()
    start, end = run.start, run.end
    body = []
    for line in lines:
        m = re.match(r"^\s*#\s*window\s*:\s*([\d.]+)\s*-\s*([\d.]+)", line, re.IGNORECASE)
        if m:
            start, end = float(m.group(1)), float(m.group(2))
        elif not line.lstrip().startswith("#"):
            body.append(line)
    # Only the part of the window that was played; the reference text
    # itself cannot be cut, so a window that was partly skipped scores as
    # deletions. Keep reference.txt windows inside one played stretch.
    return Reference(
        "reference.txt",
        "accuracy vs hand-corrected reference",
        " ".join(body),
        start,
        end,
        run.clip([[start, end]]),
    )


def load_captions(run: Run) -> cap.Captions | None:
    name = run.meta.get("captions_file")
    path = run.run_dir / name if name else None
    if path is None or not path.is_file():
        return None
    kind = (run.meta.get("source") or {}).get("captions_kind")
    if kind in ("uploaded", "file") and run.meta.get("request", {}).get("captions_human"):
        kind = "human"
    return cap.parse_vtt(path, kind if kind in ("human", "auto", "uploaded") else None)


def caption_reference(captions: cap.Captions, run: Run) -> Reference:
    if captions.kind == "auto":
        label = "agreement with YouTube ASR (auto-captions), not accuracy"
    elif captions.kind == "uploaded":
        label = "agreement with uploaded captions of unverified origin (may be machine-made)"
    else:
        label = "accuracy vs human captions"
    return Reference(
        f"{captions.kind} captions",
        label,
        " ".join(captions.text_between(a, b) for a, b in run.segments),
        run.start,
        run.end,
        run.segments,
    )


def hypothesis_text(run: Run, segments) -> str:
    # In source order, like the reference: after a backward seek, play order
    # is not source order.
    finals = sorted(run.finals, key=lambda f: f.midpoint)
    return " ".join(f.text for f in finals if any(a <= f.midpoint < b for a, b in segments))


def wer_block(ref: Reference, hyp: str) -> dict:
    r, h = normalize(ref.text), normalize(hyp)
    block = {
        "source": ref.source,
        "label": ref.label,
        "window": [round(ref.start, 2), round(ref.end, 2)],
        "segments": [[round(a, 2), round(b, 2)] for a, b in ref.segments],
        "ref_words": len(r.split()),
        "hyp_words": len(h.split()),
    }
    if not r:
        return {**block, "wer": None}
    out = jiwer.process_words(r, h or "<empty>")
    return {
        **block,
        "wer": round(out.wer, 4),
        "substitutions": out.substitutions,
        "deletions": out.deletions,
        "insertions": out.insertions,
        "hits": out.hits,
    }


def ref_span_wer(
    captions_ref: Reference, captions: cap.Captions, run: Run, expected: list[Expected]
) -> dict:
    """WER restricted to the words around each spoken reference (book names
    and numbers), via one global alignment of the caption and final text."""
    tokens: list[tuple[float, str]] = []
    in_ref = lambda t: any(a <= t < b for a, b in captions_ref.segments)  # noqa: E731
    for seg in captions.segments:
        words = [w for w in seg.words if in_ref(w.t)]
        if not words:
            continue
        norm = normalize(" ".join(w.text for w in words)).split()
        t0, t1 = words[0].t, words[-1].t
        for k, tok in enumerate(norm):
            tokens.append((t0 + (t1 - t0) * k / max(1, len(norm) - 1), tok))
    spans = merge([x.t_start - 0.5, x.t + 0.5] for x in expected)
    in_span = [any(a <= t <= b for a, b in spans) for t, _ in tokens]
    n = sum(in_span)
    if not tokens or n == 0:
        return {"ref_words": 0, "wer": None, "spans": len(spans)}
    hyp = normalize(hypothesis_text(run, captions_ref.segments)) or "<empty>"
    out = jiwer.process_words(" ".join(t for _, t in tokens), hyp)
    s = d = i = 0
    for chunk in out.alignments[0]:
        idx = range(chunk.ref_start_idx, chunk.ref_end_idx)
        if chunk.type == "substitute":
            s += sum(in_span[k] for k in idx)
        elif chunk.type == "delete":
            d += sum(in_span[k] for k in idx)
        elif chunk.type == "insert":
            k = chunk.ref_start_idx
            near = (k < len(in_span) and in_span[k]) or (k > 0 and in_span[k - 1])
            i += (chunk.hyp_end_idx - chunk.hyp_start_idx) if near else 0
    return {
        "ref_words": n,
        "spans": len(spans),
        "wer": round((s + d + i) / n, 4),
        "substitutions": s,
        "deletions": d,
        "insertions": i,
    }
