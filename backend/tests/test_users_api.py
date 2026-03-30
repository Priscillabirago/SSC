"""API tests for /users/onboarding-status and /users/export."""

import json
from datetime import datetime, timedelta, timezone

from app.models.study_session import SessionStatus, StudySession
from app.models.subject import Subject, SubjectDifficulty, SubjectPriority
from app.models.task import Task, TaskPriority
def test_onboarding_status_false_without_data(client, auth_headers, test_user):
    r = client.get("/users/onboarding-status", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == {"completed": False}


def test_onboarding_status_true_when_all_prereqs_exist(
    client, auth_headers, db_session, test_user
):
    subj = Subject(
        user_id=test_user.id,
        name="Math",
        priority=SubjectPriority.HIGH,
        difficulty=SubjectDifficulty.MEDIUM,
        workload=3,
        color="#000000",
    )
    db_session.add(subj)
    db_session.flush()

    task = Task(
        user_id=test_user.id,
        subject_id=subj.id,
        title="Homework",
        estimated_minutes=60,
        priority=TaskPriority.MEDIUM,
        is_recurring_template=False,
    )
    db_session.add(task)

    start = datetime.now(timezone.utc)
    sess = StudySession(
        user_id=test_user.id,
        subject_id=subj.id,
        task_id=None,
        start_time=start,
        end_time=start + timedelta(hours=1),
        status=SessionStatus.PLANNED,
    )
    db_session.add(sess)
    db_session.commit()

    r = client.get("/users/onboarding-status", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == {"completed": True}


def test_export_returns_json_with_expected_keys(client, auth_headers, test_user):
    r = client.get("/users/export", headers=auth_headers)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("application/json")
    data = json.loads(r.content.decode("utf-8"))
    assert "exported_at" in data
    assert "user" in data
    assert data["user"]["email"] == test_user.email
    assert "subjects" in data
    assert "tasks" in data
    assert "study_sessions" in data
    assert "reflections" in data


def test_export_unauthorized_without_token(client):
    r = client.get("/users/export")
    assert r.status_code == 401


def test_onboarding_status_false_when_only_subjects_exist(
    client, auth_headers, db_session, test_user
):
    """Need at least one non-template task and one session — subjects alone is incomplete."""
    subj = Subject(
        user_id=test_user.id,
        name="OnlySubj",
        priority=SubjectPriority.HIGH,
        difficulty=SubjectDifficulty.MEDIUM,
        workload=3,
        color="#000000",
    )
    db_session.add(subj)
    db_session.commit()

    r = client.get("/users/onboarding-status", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == {"completed": False}


def test_export_excludes_recurring_templates(client, auth_headers, db_session, test_user):
    subj = Subject(
        user_id=test_user.id,
        name="S",
        priority=SubjectPriority.HIGH,
        difficulty=SubjectDifficulty.MEDIUM,
        workload=3,
        color="#000000",
    )
    db_session.add(subj)
    db_session.flush()

    db_session.add(
        Task(
            user_id=test_user.id,
            subject_id=subj.id,
            title="TemplateOnly",
            estimated_minutes=30,
            priority=TaskPriority.MEDIUM,
            is_recurring_template=True,
        )
    )
    db_session.add(
        Task(
            user_id=test_user.id,
            subject_id=subj.id,
            title="RealTask",
            estimated_minutes=30,
            priority=TaskPriority.MEDIUM,
            is_recurring_template=False,
        )
    )
    db_session.commit()

    r = client.get("/users/export", headers=auth_headers)
    assert r.status_code == 200
    data = json.loads(r.content.decode("utf-8"))
    titles = [t["title"] for t in data["tasks"]]
    assert "RealTask" in titles
    assert "TemplateOnly" not in titles
