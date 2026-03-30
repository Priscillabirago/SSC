"""Study journal isolation and share-link lifecycle."""

import json
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from app.core.security import create_access_token, get_password_hash
from app.models.daily_reflection import DailyReflection
from app.models.study_session import SessionStatus, StudySession
from app.models.subject import Subject, SubjectDifficulty, SubjectPriority
from app.models.user import User


def test_study_journal_merged_chronological_and_isolated(
    client, db_session, test_user, auth_headers
):
    sub = Subject(
        user_id=test_user.id,
        name="JSub",
        priority=SubjectPriority.HIGH,
        difficulty=SubjectDifficulty.MEDIUM,
        workload=2,
        color="#000",
    )
    db_session.add(sub)
    db_session.flush()

    t0 = datetime(2026, 3, 10, 14, 0, 0, tzinfo=timezone.utc)
    db_session.add(
        StudySession(
            user_id=test_user.id,
            subject_id=sub.id,
            task_id=None,
            start_time=t0,
            end_time=t0 + timedelta(minutes=45),
            status=SessionStatus.COMPLETED,
            notes="Session note alpha",
        )
    )
    db_session.add(
        DailyReflection(
            user_id=test_user.id,
            day=t0.date(),
            worked="y",
            challenging="n",
            summary="reflect",
            suggestion=None,
        )
    )
    other = User(
        email="other@example.com",
        full_name="Other",
        hashed_password=get_password_hash("x"),
        timezone="UTC",
        weekly_study_hours=5,
        preferred_study_windows=["evening"],
    )
    db_session.add(other)
    db_session.flush()

    osession = datetime(2026, 3, 10, 20, 0, 0, tzinfo=timezone.utc)
    db_session.add(
        StudySession(
            user_id=other.id,
            subject_id=None,
            task_id=None,
            start_time=osession,
            end_time=osession + timedelta(hours=1),
            status=SessionStatus.COMPLETED,
            notes="OTHER_USER_SECRET",
        )
    )
    db_session.commit()

    r = client.get("/analytics/study-journal", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    contents = json.dumps(body)
    assert "Session note alpha" in contents
    assert "OTHER_USER_SECRET" not in contents

    other_headers = {"Authorization": f"Bearer {create_access_token(other.id)}"}
    r2 = client.get("/analytics/study-journal", headers=other_headers)
    assert r2.status_code == 200
    assert "OTHER_USER_SECRET" in json.dumps(r2.json())


def test_share_token_lifecycle(client, auth_headers, test_user, db_session):
    st = client.get("/share/status", headers=auth_headers)
    assert st.status_code == 200
    assert st.json()["has_active_link"] is False

    created = client.post("/share", headers=auth_headers)
    assert created.status_code == 200
    url = created.json()["url"]
    token = urlparse(url).path.rstrip("/").split("/")[-1]

    st2 = client.get("/share/status", headers=auth_headers)
    assert st2.json()["has_active_link"] is True

    pub = client.get(f"/share/{token}")
    assert pub.status_code == 200
    assert "display_name" in pub.json()

    client.delete("/share", headers=auth_headers)

    st3 = client.get("/share/status", headers=auth_headers)
    assert st3.json()["has_active_link"] is False

    expired = client.get(f"/share/{token}")
    assert expired.status_code == 404
