from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import json
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.ext.compiler import compiles

from app.coach.gemini_adapter import GeminiCoachAdapter
from app.coach.openai_adapter import OpenAICoachAdapter
from app.db.base import Base
from app.models.coach_memory import CoachMemory
from app.models.daily_energy import DailyEnergy, EnergyLevel
from app.models.daily_reflection import DailyReflection
from app.models.study_session import SessionStatus, StudySession
from app.models.subject import Subject, SubjectDifficulty, SubjectPriority
from app.models.task import Task, TaskPriority
from app.models.user import User
from app.services import coach as coach_service


@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(type_: JSONB, compiler, **kw):
    return "JSON"


@compiles(ARRAY, "sqlite")
def _compile_array_sqlite(type_: ARRAY, compiler, **kw):
    return "JSON"


@pytest.fixture()
def engine():
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(engine)
    try:
        yield engine
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture()
def db_session(engine: Session):
    with Session(engine) as session:
        yield session
        session.rollback()


def test_build_coach_context_includes_recent_activity(monkeypatch: pytest.MonkeyPatch, db_session: Session):
    base_utc = datetime(2024, 3, 15, 18, 0, tzinfo=timezone.utc)
    base_naive = base_utc.replace(tzinfo=None)

    user = User(
        email="context@example.com",
        hashed_password="hashed",
        timezone="Asia/Singapore",
        weekly_study_hours=12,
        preferred_study_windows=["morning", "evening"],
        max_session_length=120,
        break_duration=25,
        energy_tagging_enabled=True,
    )
    db_session.add(user)
    db_session.flush()

    subject = Subject(
        user_id=user.id,
        name="Calculus",
        priority=SubjectPriority.HIGH,
        difficulty=SubjectDifficulty.HARD,
        workload=3,
    )
    db_session.add(subject)
    db_session.flush()

    active_task = Task(
        user_id=user.id,
        subject_id=subject.id,
        title="Draft outline",
        estimated_minutes=60,
        priority=TaskPriority.HIGH,
        deadline=base_naive + timedelta(days=2),
    )
    completed_task = Task(
        user_id=user.id,
        subject_id=subject.id,
        title="Read chapter",
        estimated_minutes=45,
        priority=TaskPriority.MEDIUM,
        is_completed=True,
    )
    due_tomorrow_task = Task(
        user_id=user.id,
        subject_id=subject.id,
        title="Lab report",
        estimated_minutes=90,
        priority=TaskPriority.CRITICAL,
        deadline=base_naive + timedelta(hours=23),
    )
    db_session.add_all([active_task, completed_task, due_tomorrow_task])
    db_session.flush()

    completed_task.updated_at = base_naive

    completed_session = StudySession(
        user_id=user.id,
        subject_id=subject.id,
        task_id=completed_task.id,
        start_time=base_naive - timedelta(hours=1),
        end_time=base_naive - timedelta(minutes=30),
        status=SessionStatus.COMPLETED,
        energy_level="medium",
        generated_by="weekly",
    )
    upcoming_session = StudySession(
        user_id=user.id,
        subject_id=subject.id,
        task_id=active_task.id,
        start_time=base_naive + timedelta(hours=1),
        end_time=base_naive + timedelta(hours=2),
        status=SessionStatus.PLANNED,
        energy_level="high",
        generated_by="micro",
    )
    db_session.add_all([completed_session, upcoming_session])

    local_day = base_utc.astimezone(ZoneInfo(user.timezone)).date()
    db_session.add(DailyEnergy(user_id=user.id, day=local_day, level=EnergyLevel.HIGH))
    db_session.add(
        DailyReflection(
            user_id=user.id,
            day=local_day,
            summary="Stayed focused through the longest block.",
            suggestion="Prep notes before the evening session.",
        )
    )
    db_session.add(
        CoachMemory(
            user_id=user.id,
            topic="plan",
            content="Student prefers calculus in the first block.",
            source="chat",
        )
    )
    db_session.add(
        CoachMemory(
            user_id=user.id,
            topic="action_item",
            content=json.dumps({"content": "Review Draft outline progress", "related_task": "Draft outline"}),
            source="chat",
        )
    )
    db_session.add(
        CoachMemory(
            user_id=user.id,
            topic="question",
            content=json.dumps({"content": "What blocked the Lab report yesterday?"}),
            source="chat",
        )
    )
    db_session.commit()

    class FixedDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            if tz is None:
                return base_naive
            return base_utc.astimezone(tz)

    class FixedDate(date):
        @classmethod
        def today(cls):
            return local_day

    monkeypatch.setattr(coach_service, "datetime", FixedDateTime)
    monkeypatch.setattr(coach_service, "date", FixedDate)

    context = coach_service.build_coach_context(db_session, user)

    assert context["energy"] == EnergyLevel.HIGH.value
    assert context["active_tasks_count"] == 2
    assert "Draft outline" in context["active_tasks"]
    assert "Lab report" in {task["title"] for task in context["tasks_due_tomorrow"]}
    assert any(item["status"] == SessionStatus.PLANNED.value for item in context["upcoming_sessions"])
    assert any(item["status"] == SessionStatus.COMPLETED.value for item in context["completed_sessions_today"])
    assert any(item["title"] == "Read chapter" for item in context["completed_tasks_today"])
    assert context["recent_reflection"]["summary"] == "Stayed focused through the longest block."
    assert "Student prefers calculus in the first block." in context["memories"]
    assert context["action_items"][0]["content"] == "Review Draft outline progress"
    assert context["open_questions"][0]["content"] == "What blocked the Lab report yesterday?"


def test_adapter_prompts_include_context_lines():
    user = User(
        email="prompt@example.com",
        hashed_password="hashed",
        timezone="UTC",
        weekly_study_hours=18,
        preferred_study_windows=["evening"],
        max_session_length=120,
        break_duration=15,
    )

    context = {
        "energy": "high",
        "active_tasks_count": 1,
        "completed_tasks_today": [{"title": "Essay draft"}],
        "completed_sessions_today": [
            {"task": "Essay draft", "subject": "History", "status": "completed"},
        ],
        "tasks_due_tomorrow": [{"title": "Lab report", "priority": "high"}],
        "recent_reflection": {"summary": "Great focus", "suggestion": "Take a short walk"},
        "upcoming_sessions": [{"focus": "micro", "status": "planned", "start": "2024-03-16T09:00:00"}],
        "memories": [],
        "action_items": [{"content": "Review Draft outline progress", "related_task": "Draft outline"}],
        "open_questions": [{"content": "Any blockers for the lab report?"}],
    }

    openai_adapter = OpenAICoachAdapter(api_key=None)
    messages = openai_adapter._build_messages(user, "Help me plan", context)
    system_content = messages[0]["content"]

    assert "single-sentence headline" in system_content
    assert "Wins – include only" in system_content
    assert "Blockers – include only" in system_content
    assert "Action items:" in system_content
    assert "Completed today: Essay draft" in system_content
    assert "Sessions today: Essay draft / History (completed)" in system_content
    assert "Due tomorrow: Lab report (high)" in system_content
    assert "Latest reflection: Great focus | Tip: Take a short walk" in system_content

    gemini_adapter = GeminiCoachAdapter(api_key=None)
    gemini_prompt = gemini_adapter._prepare_prompt(user, "Assist me", context)
    assert "headline → optional Wins section" in gemini_prompt
    assert "Action items:" in gemini_prompt
    assert "Completed today: Essay draft" in gemini_prompt
    assert "Due tomorrow: Lab report (high)" in gemini_prompt
    assert "Latest reflection: Great focus | Tip: Take a short walk" in gemini_prompt

