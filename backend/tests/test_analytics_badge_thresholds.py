"""Badge earned state at and below threshold for steady_start (3 sessions)."""

from datetime import datetime, timedelta, timezone

from app.models.study_session import SessionStatus, StudySession


def _completed_session(user_id: int, subject_id: int | None, start: datetime) -> StudySession:
    return StudySession(
        user_id=user_id,
        subject_id=subject_id,
        task_id=None,
        start_time=start,
        end_time=start + timedelta(minutes=45),
        status=SessionStatus.COMPLETED,
    )


def test_steady_start_not_earned_with_two_sessions(client, auth_headers, db_session, test_user):
    t0 = datetime(2026, 5, 1, 10, 0, 0, tzinfo=timezone.utc)
    for i in range(2):
        db_session.add(_completed_session(test_user.id, None, t0 + timedelta(days=i)))
    db_session.commit()

    r = client.get("/analytics/badges", headers=auth_headers)
    assert r.status_code == 200
    badges = {b["id"]: b for b in r.json()["badges"]}
    assert badges["steady_start"]["earned"] is False
    assert badges["steady_start"]["progress"] == 2
    assert badges["steady_start"]["threshold"] == 3


def test_steady_start_earned_with_exactly_three_sessions(
    client, auth_headers, db_session, test_user
):
    t0 = datetime(2026, 5, 10, 10, 0, 0, tzinfo=timezone.utc)
    for i in range(3):
        db_session.add(_completed_session(test_user.id, None, t0 + timedelta(hours=i)))
    db_session.commit()

    r = client.get("/analytics/badges", headers=auth_headers)
    assert r.status_code == 200
    badges = {b["id"]: b for b in r.json()["badges"]}
    assert badges["steady_start"]["earned"] is True
    assert badges["steady_start"]["progress"] == 3
