"""Integration tests for task and subject CRUD."""

import json

from app.models.subject import Subject
from app.models.task import Task


def test_subject_crud_flow(client, auth_headers, db_session, test_user):
    r = client.post(
        "/subjects/",
        headers=auth_headers,
        json={
            "name": "Physics",
            "priority": "high",
            "difficulty": "medium",
            "workload": 3,
            "color": "#111111",
        },
    )
    assert r.status_code == 201
    sid = r.json()["id"]

    r2 = client.put(
        f"/subjects/{sid}",
        headers=auth_headers,
        json={"name": "Physics II"},
    )
    assert r2.status_code == 200
    assert r2.json()["name"] == "Physics II"

    r3 = client.delete(f"/subjects/{sid}", headers=auth_headers)
    assert r3.status_code == 204
    assert db_session.get(Subject, sid) is None


def test_task_create_update_complete_delete(client, auth_headers, db_session, test_user):
    r = client.post(
        "/subjects/",
        headers=auth_headers,
        json={
            "name": "Math",
            "priority": "high",
            "difficulty": "medium",
            "workload": 3,
            "color": "#222222",
        },
    )
    sid = r.json()["id"]

    r = client.post(
        "/tasks/",
        headers=auth_headers,
        json={
            "title": "Problem set",
            "estimated_minutes": 45,
            "priority": "medium",
            "subject_id": sid,
        },
    )
    assert r.status_code == 201
    tid = r.json()["id"]

    r = client.patch(
        f"/tasks/{tid}",
        headers=auth_headers,
        json={"title": "Problem set (updated)"},
    )
    assert r.status_code == 200
    assert r.json()["title"] == "Problem set (updated)"

    r = client.patch(
        f"/tasks/{tid}",
        headers=auth_headers,
        json={"is_completed": True},
    )
    assert r.status_code == 200
    assert r.json()["is_completed"] is True

    r = client.delete(f"/tasks/{tid}", headers=auth_headers)
    assert r.status_code == 204
    assert db_session.get(Task, tid) is None


def test_patch_complete_recurring_instance_triggers_next_occurrence(
    client, auth_headers, test_user
):
    """Completing a recurring instance should surface a following instance (deadline in the future)."""
    r = client.post(
        "/subjects/",
        headers=auth_headers,
        json={
            "name": "RecSubj",
            "priority": "medium",
            "difficulty": "medium",
            "workload": 2,
            "color": "#555555",
        },
    )
    sid = r.json()["id"]
    r = client.post(
        "/tasks/",
        headers=auth_headers,
        json={
            "title": "Water plants",
            "estimated_minutes": 15,
            "priority": "medium",
            "subject_id": sid,
            "is_recurring_template": True,
            "recurrence_pattern": {"frequency": "daily", "interval": 1},
        },
    )
    assert r.status_code == 201
    template_id = r.json()["id"]

    listed = client.get("/tasks/", headers=auth_headers).json()
    instances = [
        t
        for t in listed
        if t.get("recurring_template_id") == template_id
        and not t.get("is_recurring_template")
    ]
    assert instances, "expected at least one generated instance"
    inst = min(instances, key=lambda t: t["id"])
    iid = inst["id"]

    r = client.patch(
        f"/tasks/{iid}",
        headers=auth_headers,
        json={"status": "completed"},
    )
    assert r.status_code == 200

    listed_after = client.get("/tasks/", headers=auth_headers).json()
    future = [t for t in listed_after if t.get("recurring_template_id") == template_id]
    assert len(future) >= len(instances)


def test_create_recurring_template_succeeds(client, auth_headers, test_user):
    r = client.post(
        "/subjects/",
        headers=auth_headers,
        json={
            "name": "RecurringSubj",
            "priority": "medium",
            "difficulty": "medium",
            "workload": 2,
            "color": "#444444",
        },
    )
    sid = r.json()["id"]
    r = client.post(
        "/tasks/",
        headers=auth_headers,
        json={
            "title": "Daily habit",
            "estimated_minutes": 25,
            "priority": "medium",
            "subject_id": sid,
            "is_recurring_template": True,
            "recurrence_pattern": {"frequency": "daily", "interval": 1},
        },
    )
    assert r.status_code == 201
    assert r.json()["title"] == "Daily habit"


def test_delete_subject_cascades_tasks(client, auth_headers, db_session, test_user):
    r = client.post(
        "/subjects/",
        headers=auth_headers,
        json={
            "name": "Temp",
            "priority": "low",
            "difficulty": "easy",
            "workload": 1,
            "color": "#333333",
        },
    )
    sid = r.json()["id"]
    r = client.post(
        "/tasks/",
        headers=auth_headers,
        json={
            "title": "Cascade me",
            "estimated_minutes": 30,
            "priority": "low",
            "subject_id": sid,
        },
    )
    tid = r.json()["id"]

    client.delete(f"/subjects/{sid}", headers=auth_headers)
    assert db_session.get(Task, tid) is None
