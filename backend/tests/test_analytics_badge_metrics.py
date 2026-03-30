"""Tests for _compute_badge_metrics (hours, sessions, scheduler-generated count, reflections)."""

import math
from datetime import date, datetime, timedelta, timezone

from app.api.routes.analytics import _compute_badge_metrics
from app.models.daily_reflection import DailyReflection
from app.models.study_session import SessionStatus, StudySession


def test_compute_badge_metrics_empty_user(db_session, test_user):
    m = _compute_badge_metrics(db_session, test_user.id, "UTC")
    assert m["completed_sessions"] == 0
    assert math.isclose(m["total_hours"], 0.0)
    assert m["streak"] == 0
    assert m["schedules_generated"] == 0
    assert m["reflections"] == 0


def test_compute_badge_metrics_counts_completed_hours_and_scheduler(
    db_session, test_user
):
    start = datetime(2026, 3, 1, 12, 0, 0, tzinfo=timezone.utc)
    # 60 min completed
    db_session.add(
        StudySession(
            user_id=test_user.id,
            subject_id=None,
            task_id=None,
            start_time=start,
            end_time=start + timedelta(hours=1),
            status=SessionStatus.COMPLETED,
            generated_by="manual",
        )
    )
    # Scheduler row (distinct date count)
    s2_start = datetime(2026, 3, 2, 10, 0, 0, tzinfo=timezone.utc)
    db_session.add(
        StudySession(
            user_id=test_user.id,
            subject_id=None,
            task_id=None,
            start_time=s2_start,
            end_time=s2_start + timedelta(minutes=30),
            status=SessionStatus.COMPLETED,
            generated_by="scheduler",
        )
    )
    db_session.add(
        DailyReflection(
            user_id=test_user.id,
            day=date(2026, 3, 1),
            worked="yes",
            challenging="no",
            summary="ok",
            suggestion=None,
        )
    )
    db_session.commit()

    m = _compute_badge_metrics(db_session, test_user.id, "UTC")
    assert m["completed_sessions"] == 2
    assert abs(m["total_hours"] - 1.5) < 0.01  # 60 + 30 min
    assert m["schedules_generated"] >= 1
    assert m["reflections"] == 1
