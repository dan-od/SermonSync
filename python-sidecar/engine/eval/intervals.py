"""Interval arithmetic and small statistics helpers for the scorer (SS-072)."""

from __future__ import annotations

import statistics

CAPTION_PAD = 0.25  # caption timing slop, seconds


# ---------------------------------------------------------------------------
# Interval helpers ([start, end] lists, merged and sorted)
# ---------------------------------------------------------------------------


def merge(intervals) -> list[list[float]]:
    out: list[list[float]] = []
    for a, b in sorted((float(a), float(b)) for a, b in intervals if b > a):
        if out and a <= out[-1][1]:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return out


def total(intervals) -> float:
    return sum(b - a for a, b in intervals)


def intersect(x, y) -> list[list[float]]:
    x, y, out, i, j = merge(x), merge(y), [], 0, 0
    while i < len(x) and j < len(y):
        a, b = max(x[i][0], y[j][0]), min(x[i][1], y[j][1])
        if b > a:
            out.append([a, b])
        if x[i][1] < y[j][1]:
            i += 1
        else:
            j += 1
    return out


def subtract(x, y) -> list[list[float]]:
    out = []
    for a, b in merge(x):
        cur = a
        for c, d in merge(y):
            if d <= cur or c >= b:
                continue
            if c > cur:
                out.append([cur, c])
            cur = max(cur, d)
        if cur < b:
            out.append([cur, b])
    return out


def pad(intervals, amount: float) -> list[list[float]]:
    return merge([a - amount, b + amount] for a, b in intervals)


def clip(intervals, start: float, end: float) -> list[list[float]]:
    return intersect(intervals, [[start, end]])


def _pct(num: float, den: float) -> float | None:
    return round(100.0 * num / den, 1) if den > 0 else None


def _median(values) -> float | None:
    values = list(values)
    return round(statistics.median(values), 3) if values else None


def _q(values, q: float) -> float | None:
    """The q-th quantile (0-1) by nearest rank, matching _p90's convention."""
    values = sorted(values)
    if not values:
        return None
    return round(values[min(len(values) - 1, int(q * len(values)))], 3)


def _p90(values) -> float | None:
    values = sorted(values)
    if not values:
        return None
    return round(values[min(len(values) - 1, int(0.9 * len(values)))], 3)
