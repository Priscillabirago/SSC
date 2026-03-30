"""Unit tests for badge streak logic."""

from datetime import datetime, timedelta, timezone

from app.api.routes.analytics import _max_streak
from app.models.study_session import SessionStatus, StudySession


def _session(
    start: datetime,
    duration_minutes: int,
    status: SessionStatus = SessionStatus.COMPLETED,
) -> StudySession:
    end = start + timedelta(minutes=duration_minutes)
    return StudySession(
        id=1,
        user_id=1,
        subject_id=None,
        task_id=None,
        start_time=start,
        end_time=end,
        status=status,
    )


def test_max_streak_zero_when_no_qualifying_days():
    """Days with <30 minutes completed do not count toward streak."""
    base = datetime(2026, 3, 1, 12, 0, 0, tzinfo=timezone.utc)
    sessions = [
        _session(base, 20),  # only 20 min
        _session(base + timedelta(days=1), 15),
    ]
    assert _max_streak(sessions, "UTC") == 0


def test_max_streak_single_day_is_one():
    base = datetime(2026, 3, 1, 12, 0, 0, tzinfo=timezone.utc)
    sessions = [_session(base, 45)]
    assert _max_streak(sessions, "UTC") == 1


def test_max_streak_three_consecutive_days():
    base = datetime(2026, 3, 1, 12, 0, 0, tzinfo=timezone.utc)
    sessions = [
        _session(base, 60),
        _session(base + timedelta(days=1), 60),
        _session(base + timedelta(days=2), 60),
    ]
    assert _max_streak(sessions, "UTC") == 3


def test_max_streak_gap_resets_run():
    base = datetime(2026, 3, 1, 12, 0, 0, tzinfo=timezone.utc)
    sessions = [
        _session(base, 60),
        _session(base + timedelta(days=1), 60),
        _session(base + timedelta(days=3), 60),  # skip one day
    ]
    assert _max_streak(sessions, "UTC") == 2


def test_max_streak_skips_non_completed_status():
    base = datetime(2026, 3, 1, 12, 0, 0, tzinfo=timezone.utc)
    sessions = [
        _session(base, 60, SessionStatus.COMPLETED),
        _session(base + timedelta(days=1), 60, SessionStatus.SKIPPED),
        _session(base + timedelta(days=2), 60, SessionStatus.COMPLETED),
    ]
    assert _max_streak(sessions, "UTC") == 1


def test_max_streak_invalid_timezone_falls_back_like_analytics():
    base = datetime(2026, 3, 1, 12, 0, 0, tzinfo=timezone.utc)
    sessions = [_session(base, 60)]
    assert _max_streak(sessions, "Invalid/Zone") == 1
