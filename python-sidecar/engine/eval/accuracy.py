"""Scripture-matching accuracy + robustness evaluation (SS-059 / SS-061).

A curated dataset of transcript snippets (paraphrases, direct quotes, allusions)
with the acceptable reference(s), plus adversarial negatives (non-biblical text)
that must NOT produce a confident match. Provides per-stage and end-to-end
precision/recall metrics and a false-positive guard.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# High-confidence threshold above which a match on a NEGATIVE case counts as a
# false positive (SS-061).
FALSE_POSITIVE_THRESHOLD = 0.85


@dataclass
class Case:
    text: str
    # Any of these references is an acceptable top-1 answer (paraphrases map to
    # several valid verses). Empty = negative case (expect no confident match).
    expected: set[str] = field(default_factory=set)
    context: list[str] = field(default_factory=list)


# --- Positive cases -------------------------------------------------------
POSITIVE_CASES: list[Case] = [
    Case("For God so loved the world", {"John 3:16"}),
    Case("The Lord is my shepherd", {"Psalms 23:1"}),
    Case("In the beginning God created", {"Genesis 1:1"}),
    Case("the wages of sin is death", {"Romans 6:23"}),
    Case(
        "faith without works is dead",
        {"James 2:17", "James 2:20", "James 2:26"},
    ),
    Case(
        "love your neighbor as yourself",
        {
            "Leviticus 19:18", "Matthew 19:19", "Matthew 22:39", "Mark 12:31",
            "Mark 12:33", "Romans 13:9", "Romans 13:10", "Galatians 5:14",
            "James 2:8",
        },
    ),
    Case("I can do all things through Christ", {"Philippians 4:13"}),
    Case("be still and know that I am God", {"Psalms 46:10"}),
    Case("the truth shall make you free", {"John 8:32"}),
    Case("he restoreth my soul", {"Psalms 23:3"}),
]

# --- Negative (adversarial) cases — must NOT match confidently (SS-061) ---
NEGATIVE_CASES: list[Case] = [
    Case("let us review the quarterly budget spreadsheet"),
    Case("the pizza will be delivered at noon tomorrow"),
    Case("please remember to update the software license key"),
    Case("welcome everybody to the announcements this morning"),
    Case("the parking lot is closed for maintenance today"),
    Case("and uh so yeah you know what i mean right"),  # filler / fast speech
]


def evaluate_orchestrator(orchestrator, positives=None, negatives=None) -> dict:
    """Run the full cascade over the dataset; return accuracy + FP metrics."""
    positives = POSITIVE_CASES if positives is None else positives
    negatives = NEGATIVE_CASES if negatives is None else negatives

    correct = 0
    positive_detail = []
    for case in positives:
        results = orchestrator.match(case.text, case.context)
        top = results[0]["reference"] if results else None
        hit = top in case.expected
        correct += int(hit)
        positive_detail.append({"text": case.text, "top": top, "hit": hit})

    false_positives = 0
    negative_detail = []
    for case in negatives:
        results = orchestrator.match(case.text, case.context)
        confident = [
            r for r in results if r["confidence"] >= FALSE_POSITIVE_THRESHOLD
        ]
        is_fp = len(confident) > 0
        false_positives += int(is_fp)
        negative_detail.append(
            {
                "text": case.text,
                "top": results[0]["reference"] if results else None,
                "top_conf": results[0]["confidence"] if results else 0.0,
                "false_positive": is_fp,
            }
        )

    return {
        "top1_accuracy": round(correct / len(positives), 4) if positives else 0.0,
        "correct": correct,
        "total_positive": len(positives),
        "false_positives": false_positives,
        "total_negative": len(negatives),
        "positive_detail": positive_detail,
        "negative_detail": negative_detail,
    }


def evaluate_stage(matcher, cases=None) -> dict:
    """Per-stage top-1 recall over the positive cases (precision/recall input)."""
    cases = POSITIVE_CASES if cases is None else cases
    hits = 0
    for case in cases:
        try:
            results = matcher.match(case.text)
        except TypeError:  # llm-style matchers take (sentence, context)
            results = matcher.match(case.text, case.context)
        refs = {r["reference"] for r in results}
        if refs & case.expected:
            hits += 1
    return {"recall_at_k": round(hits / len(cases), 4), "hits": hits, "total": len(cases)}
