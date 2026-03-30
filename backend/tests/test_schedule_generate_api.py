"""Smoke test for weekly schedule generation endpoint."""

from app.models.subject import Subject, SubjectDifficulty, SubjectPriority
from app.models.task import Task, TaskPriority


def test_generate_weekly_schedule_returns_plan(client, auth_headers, db_session, test_user):
    sub = Subject(
        user_id=test_user.id,
        name="GenSubj",
        priority=SubjectPriority.HIGH,
        difficulty=SubjectDifficulty.MEDIUM,
        workload=3,
        color="#000",
    )
    db_session.add(sub)
    db_session.flush()
    db_session.add(
        Task(
            user_id=test_user.id,
            subject_id=sub.id,
            title="Do work",
            estimated_minutes=120,
            priority=TaskPriority.HIGH,
            is_recurring_template=False,
        )
    )
    db_session.commit()

    r = client.post("/schedule/generate", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert "days" in body
    assert len(body["days"]) == 7
