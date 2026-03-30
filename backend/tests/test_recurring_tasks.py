"""Unit tests for recurring task next-occurrence helpers."""

from datetime import datetime, timedelta, timezone

from app.services.recurring_tasks import calculate_next_occurrence


def test_calculate_next_occurrence_daily():
    start = datetime(2026, 3, 1, 9, 0, 0, tzinfo=timezone.utc)
    pattern = {"frequency": "daily", "interval": 1}
    nxt = calculate_next_occurrence(pattern, None, start, end_date=None)
    assert nxt is not None
    assert nxt.date() == start.date() + timedelta(days=1)


def test_calculate_next_occurrence_returns_none_past_end():
    start = datetime(2026, 3, 1, 9, 0, 0, tzinfo=timezone.utc)
    end = datetime(2026, 3, 2, 0, 0, 0, tzinfo=timezone.utc)
    pattern = {"frequency": "daily", "interval": 1}
    last = datetime(2026, 3, 1, 9, 0, 0, tzinfo=timezone.utc)
    nxt = calculate_next_occurrence(pattern, last, start, end_date=end)
    assert nxt is None


def test_calculate_next_occurrence_no_pattern_returns_none():
    assert calculate_next_occurrence({}, None, datetime.now(timezone.utc)) is None


def test_calculate_next_occurrence_weekly_finds_next_weekday():
    # Monday March 2, 2026 — next occurrence on Wednesday in same week
    start = datetime(2026, 3, 2, 10, 0, 0, tzinfo=timezone.utc)
    pattern = {"frequency": "weekly", "interval": 1, "days_of_week": [2]}  # Wednesday
    last = datetime(2026, 3, 2, 10, 0, 0, tzinfo=timezone.utc)
    nxt = calculate_next_occurrence(pattern, last, start, end_date=None)
    assert nxt is not None
    assert nxt.weekday() == 2
