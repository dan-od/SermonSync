"""Spoken scripture-reference parser: clean speech and Whisper-damaged text."""

from __future__ import annotations

import pytest
from engine.matching.reference_parser import (
    RefContext,
    ReferenceTracker,
    parse_references,
)


def refs(text, ctx=None, chapters=False):
    return [r.reference for r in parse_references(text, ctx, include_chapters=chapters)]


@pytest.mark.parametrize(
    "text, expected",
    [
        # Written forms
        ("John 3:16", ["John 3:16"]),
        ("Romans 8:28-30", ["Romans 8:28-30"]),
        ("1 Corinthians 13:4-7", ["1 Corinthians 13:4-7"]),
        ("Philippians 4:13.", ["Philippians 4:13"]),
        ("Psalm 23:1", ["Psalms 23:1"]),
        ("Psalms 91:1", ["Psalms 91:1"]),
        ("Song of Solomon 2:4", ["Song of Solomon 2:4"]),
        ("Song of Songs 8:6", ["Song of Solomon 8:6"]),
        ("Revelations 3:20", ["Revelation 3:20"]),
        ("Matthew 6:33 and Luke 12:31", ["Matthew 6:33", "Luke 12:31"]),
        # Spoken forms
        ("turn with me to John chapter three verse sixteen", ["John 3:16"]),
        ("John three sixteen", ["John 3:16"]),
        ("Romans eight twenty eight", ["Romans 8:28"]),
        ("Romans chapter eight, verse twenty-eight", ["Romans 8:28"]),
        ("Isaiah fifty-three five", ["Isaiah 53:5"]),
        ("Psalm a hundred and nineteen verse one hundred and five", ["Psalms 119:105"]),
        ("Psalm one hundred nineteen verse eleven", ["Psalms 119:11"]),
        ("Genesis chapter 1 verse 1 to 3", ["Genesis 1:1-3"]),
        ("Ephesians 2 verses 8 through 10", ["Ephesians 2:8-10"]),
        ("Proverbs 3 5 and 6", ["Proverbs 3:5-6"]),
        ("Hebrews 11 one", ["Hebrews 11:1"]),
        ("Matthew 6, verse 33", ["Matthew 6:33"]),
        ("Joshua chapter 1 from verse 8", ["Joshua 1:8"]),
        # Ordinals
        ("first Corinthians 13 4 through 7", ["1 Corinthians 13:4-7"]),
        ("1st John 1:9", ["1 John 1:9"]),
        ("First John one nine", ["1 John 1:9"]),
        ("second Timothy three sixteen", ["2 Timothy 3:16"]),
        ("2nd Timothy 1:7", ["2 Timothy 1:7"]),
        ("II Kings 2:9", ["2 Kings 2:9"]),
        ("third John verse 2", ["3 John 1:2"]),  # single chapter book
        ("Third John 1 2", ["3 John 1:2"]),
        # Whisper-style damage
        ("John 3, 16", ["John 3:16"]),
        ("John 3.16", ["John 3:16"]),
        ("John 316", ["John 3:16"]),
        ("Romans 828", ["Romans 8:28"]),
        ("Psalm 119105", ["Psalms 119:105"]),
        ("Michael 6 8", ["Micah 6:8"]),
        ("June 1 24", ["Jude 1:24"]),
        ("Hey guy 2 4", ["Haggai 2:4"]),
        ("X 2 38", ["Acts 2:38"]),
        ("Acts 2:38", ["Acts 2:38"]),
        ("Zachariah 4 6", ["Zechariah 4:6"]),
        # Everyday words are not books without numbers / separators
        ("Mark my words", []),
        ("mark 5 minutes on the clock", []),
        ("the numbers 1 2 3", []),
        ("Numbers 23 19", ["Numbers 23:19"]),
        ("numbers 23:19", ["Numbers 23:19"]),
        ("Mark 5 verse 3", ["Mark 5:3"]),
        ("I did a good job 2 days ago", []),
        ("Michael 6", []),          # homophone without a verse
        ("michael 6 8", []),        # lowercase homophone, bare numbers
        ("he told June 3 things", []),
        # Invalid references are rejected by the Bible DB
        ("John 22:1", []),
        ("Jude 2:1", []),
        ("Psalm 23:7", []),
        ("John 3:16-99", ["John 3:16"]),
        # Chapter-only and ambiguous collapsed numbers emit nothing
        ("Turn to Romans 8", []),
        ("Psalm 2312", []),
        # Run-together verse ranges and single-chapter books
        ("Jeremiah eight 2022", ["Jeremiah 8:20-22"]),
        ("John 3 1617", ["John 3:16-17"]),
        ("Jude verse 24", ["Jude 1:24"]),
        ("third John verse two", ["3 John 1:2"]),
        ("Philemon verse 6", ["Philemon 1:6"]),
    ],
)
def test_parse_table(text, expected):
    assert refs(text) == expected


def test_chapter_only_included_when_asked():
    assert refs("Turn to Romans chapter 8", chapters=True) == ["Romans 8"]


def test_carry_over_verse_and_next_verse():
    ctx = RefContext()
    assert refs("Let's go to John chapter 3.", ctx) == []
    assert refs("Look at verse 17.", ctx) == ["John 3:17"]
    assert refs("And the next verse says", ctx) == ["John 3:18"]
    assert refs("verses 20 to 21", ctx) == ["John 3:20-21"]
    assert refs("Chapter 4 verse 2", ctx) == ["John 4:2"]


def test_carry_over_needs_context():
    assert refs("verse 17 says") == []
    assert refs("the next verse") == []


def test_collapsed_number_resolved_by_context():
    ctx = RefContext()
    refs("Turn to Psalm 23.", ctx)
    assert refs("Psalm 2312", ctx) == ["Psalms 23:1-2"]


def test_confidence_and_kind():
    (ref,) = parse_references("John 3:16")
    assert ref.confidence == pytest.approx(0.95) and ref.kind == "explicit"
    (ref,) = parse_references("John 316")
    assert ref.kind == "collapsed" and ref.confidence < 0.95
    (ref,) = parse_references("Michael 6 8")
    assert ref.kind == "homophone"


def test_tracker_joins_split_reference_and_dedupes():
    tr = ReferenceTracker()
    assert tr.feed("Open your Bibles to John three", 0.0, 3.0) == []
    (ref,) = tr.feed("sixteen. For God so loved", 3.0, 6.0)
    assert ref.reference == "John 3:16"
    assert 3.0 <= ref.t <= 4.5
    # Re-parsed window and a repeat within 15 s: no second result.
    assert tr.feed("the world. John 3:16 again", 6.0, 9.0) == []


def test_tracker_growing_range_is_one_reference():
    tr = ReferenceTracker()
    (ref,) = tr.feed("first Corinthians 13 4", 0.0, 2.0)
    assert ref.reference == "1 Corinthians 13:4"
    assert tr.feed("through 7 love is patient", 2.0, 4.0) == []


def test_tracker_carry_over_across_chunks():
    tr = ReferenceTracker()
    assert tr.feed("Romans chapter eight", 0.0, 2.0) == []
    (ref,) = tr.feed("verse twenty eight says all things", 2.0, 5.0)
    assert ref.reference == "Romans 8:28"
    # Long after the window, carry-over still applies (context TTL 5 min).
    (ref,) = tr.feed("now look at verse thirty one", 60.0, 62.0)
    assert ref.reference == "Romans 8:31"


def test_tracker_same_reference_later_is_new():
    tr = ReferenceTracker()
    assert len(tr.feed("John 3:16", 0.0, 1.0)) == 1
    assert len(tr.feed("and again John 3:16", 40.0, 41.0)) == 1


def test_tracker_context_expires():
    tr = ReferenceTracker(context_ttl=30.0)
    tr.feed("John chapter 3", 0.0, 1.0)
    tr.feed("unrelated talk", 20.0, 21.0)
    assert tr.feed("verse 5", 100.0, 101.0) == []


def test_book_without_chapter_breaks_carry_over():
    ctx = RefContext()
    assert refs("Jeremiah eight verse twenty-two", ctx) == ["Jeremiah 8:22"]
    # "John verse two" (3 John with "third" lost): unknown chapter, so it must
    # not become Jeremiah 8:2 ...
    assert refs("John verse two, beloved, I wish above all things", ctx) == []
    # ... and a later bare "verse" does not reach back to Jeremiah either.
    assert refs("verse three", ctx) == []


def test_tracker_waits_for_a_trailing_tens_word():
    tr = ReferenceTracker()
    assert tr.feed("Mathew thirteen fifty", 0.0, 2.0) == []
    (ref,) = tr.feed("four, to a point I have to say", 2.0, 4.0)
    assert ref.reference == "Matthew 13:54"


def test_tracker_trailing_tens_with_punctuation_is_complete():
    tr = ReferenceTracker()
    (ref,) = tr.feed("Romans eight verse twenty.", 0.0, 2.0)
    assert ref.reference == "Romans 8:20"


def test_tracker_window_never_splits_a_reference():
    """'John' leaving the window must not orphan 'verse two' (which would then
    carry over to the previous passage)."""
    tr = ReferenceTracker()
    assert [r.reference for r in tr.feed("Jeremiah eight verse twenty-two.", 0.0, 1.0)] == [
        "Jeremiah 8:22"
    ]
    assert tr.feed("daughter not recovered? John", 10.0, 12.0) == []
    assert tr.feed("verse two, beloved, I wish", 12.5, 14.0) == []
    for k in range(10):  # the window slides on long after
        assert tr.feed(f"above all things, part {k}", 15.0 + 2 * k, 16.0 + 2 * k) == []
    assert len(tr._segments) < 12
