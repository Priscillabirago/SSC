from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Optional

import json

from sqlalchemy.orm import Session

from app.models.coach_memory import CoachMemory
from app.models.daily_energy import DailyEnergy
from app.models.daily_reflection import DailyReflection
from app.models.study_session import SessionStatus, StudySession
from app.models.task import Task
from app.models.user import User
from app.models.subject import Subject

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover - Python <3.9
    ZoneInfo = None  # type: ignore[assignment]


def build_coach_context(db: Session, user: User) -> dict[str, Any]:
    today_start_utc, tomorrow_start_utc, day_after_tomorrow_start_utc = _user_day_boundaries(
        user
    )
    # Get today in user's timezone for energy log lookup
    tz_name = user.timezone or "UTC"
    if ZoneInfo:
        try:
            tz = ZoneInfo(tz_name)
        except Exception:
            tz = ZoneInfo("UTC")
        today = datetime.now(tz).date()
    else:
        # Fallback to UTC if ZoneInfo unavailable
        today = datetime.now(timezone.utc).date()
    
    energy_today = (
        db.query(DailyEnergy)
        .filter(DailyEnergy.user_id == user.id, DailyEnergy.day == today)
        .first()
    )
    recent_activity_cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=2)
    active_tasks = (
        db.query(Task)
        .filter(Task.user_id == user.id, Task.is_completed.is_(False))
        .order_by(Task.deadline.asc().nulls_last())
        .limit(10)
        .all()
    )
    upcoming_sessions = (
        db.query(StudySession)
        .filter(
            StudySession.user_id == user.id,
            StudySession.start_time >= recent_activity_cutoff,
        )
        .order_by(StudySession.start_time.asc())
        .limit(10)
        .all()
    )
    completed_sessions_today = (
        db.query(StudySession)
        .filter(
            StudySession.user_id == user.id,
            StudySession.status.in_([SessionStatus.COMPLETED, SessionStatus.PARTIAL]),
            StudySession.start_time >= today_start_utc,
            StudySession.start_time < tomorrow_start_utc,
        )
        .order_by(StudySession.start_time.asc())
        .all()
    )
    completed_tasks_today = (
        db.query(Task)
        .filter(
            Task.user_id == user.id,
            Task.is_completed.is_(True),
            Task.completed_at >= today_start_utc,
            Task.completed_at < tomorrow_start_utc,
        )
        .order_by(Task.completed_at.desc())
        .limit(10)
        .all()
    )
    tasks_due_tomorrow = (
        db.query(Task)
        .filter(
            Task.user_id == user.id,
            Task.is_completed.is_(False),
            Task.deadline.isnot(None),
            Task.deadline >= tomorrow_start_utc,
            Task.deadline < day_after_tomorrow_start_utc,
        )
        .order_by(Task.deadline.asc())
        .limit(10)
        .all()
    )
    recent_reflection = (
        db.query(DailyReflection)
        .filter(DailyReflection.user_id == user.id)
        .order_by(DailyReflection.day.desc())
        .first()
    )
    memories = (
        db.query(CoachMemory)
        .filter(CoachMemory.user_id == user.id)
        .order_by(CoachMemory.created_at.desc())
        .limit(5)
        .all()
    )
    action_item_memories = (
        db.query(CoachMemory)
        .filter(CoachMemory.user_id == user.id, CoachMemory.topic == "action_item")
        .order_by(CoachMemory.created_at.desc())
        .limit(5)
        .all()
    )
    question_memories = (
        db.query(CoachMemory)
        .filter(CoachMemory.user_id == user.id, CoachMemory.topic == "question")
        .order_by(CoachMemory.created_at.desc())
        .limit(5)
        .all()
    )
    # Subjects (limit for brevity)
    subject_qs = db.query(Subject).filter(Subject.user_id == user.id).limit(15).all()
    subject_names = [subject.name for subject in subject_qs]
    all_active_tasks = db.query(Task).filter(Task.user_id == user.id, Task.is_completed.is_(False)).limit(15).all()
    task_titles = [task.title for task in all_active_tasks]
    
    # Enhanced active tasks with full details (deadlines, priorities, etc.)
    active_tasks_detailed = [
        {
            "title": task.title,
            "deadline": task.deadline.isoformat() if task.deadline else None,
            "priority": task.priority.value if task.priority else "medium",
            "estimated_minutes": task.estimated_minutes if task.estimated_minutes else None,
            "subject": task.subject.name if task.subject else None,
        }
        for task in active_tasks
    ]
    
    return {
        "energy": energy_today.level.value if energy_today else None,
        "active_tasks_count": len(active_tasks),
        "active_tasks": [task.title for task in active_tasks],  # Keep for backward compatibility
        "active_tasks_detailed": active_tasks_detailed,  # New: full task details
        "upcoming_sessions": [
            {
                "start": session.start_time.isoformat(),
                "focus": session.generated_by,
                "status": session.status.value,
            }
            for session in upcoming_sessions
        ],
        "recent_reflection": {
            "summary": recent_reflection.summary,
            "suggestion": recent_reflection.suggestion,
        }
        if recent_reflection
        else None,
        "memories": [memory.content for memory in memories],
        "completed_sessions_today": [
            {
                "start": session.start_time.isoformat(),
                "end": session.end_time.isoformat(),
                "status": session.status.value,
                "task": session.task.title if session.task else None,
                "subject": session.subject.name if session.subject else None,
            }
            for session in completed_sessions_today
        ],
        "completed_tasks_today": [
            {"title": task.title, "finished_at": task.updated_at.isoformat()}
            for task in completed_tasks_today
        ],
        "tasks_due_tomorrow": [
            {
                "title": task.title,
                "deadline": task.deadline.isoformat() if task.deadline else None,
                "priority": task.priority.value,
            }
            for task in tasks_due_tomorrow
        ],
        "action_items": [
            _format_memory_payload(memory, default_topic="action_item") for memory in action_item_memories
        ],
        "open_questions": [
            _format_memory_payload(memory, default_topic="question") for memory in question_memories
        ],
        "subject_names": subject_names,
        "task_titles": task_titles,
    }


def log_memory(
    db: Session,
    *,
    user_id: int,
    topic: str,
    content: str,
    source: str = "coach",
) -> CoachMemory:
    memory = CoachMemory(
        user_id=user_id,
        topic=topic,
        content=content,
        source=source,
    )
    db.add(memory)
    db.commit()
    db.refresh(memory)
    return memory


def _format_memory_payload(memory: CoachMemory, default_topic: str) -> Dict[str, Any]:
    payload: Dict[str, Any]
    try:
        parsed = json.loads(memory.content)
        if isinstance(parsed, dict):
            payload = parsed
        else:
            payload = {"content": memory.content}
    except (TypeError, json.JSONDecodeError):
        payload = {"content": memory.content}
    payload.setdefault("content", "")
    payload.setdefault("type", default_topic)
    payload.setdefault("created_at", memory.created_at.isoformat() if memory.created_at else None)
    return payload


def _user_day_boundaries(user: User) -> tuple[datetime, datetime, datetime]:
    tz_name = user.timezone or "UTC"
    if ZoneInfo:
        try:
            tz = ZoneInfo(tz_name)
        except Exception:  # pragma: no cover - fallback to UTC if invalid timezone
            tz = ZoneInfo("UTC")
        now_local = datetime.now(tz)
        today_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
        tomorrow_local = today_local + timedelta(days=1)
        day_after_tomorrow_local = today_local + timedelta(days=2)
        return (
            today_local.astimezone(timezone.utc).replace(tzinfo=None),
            tomorrow_local.astimezone(timezone.utc).replace(tzinfo=None),
            day_after_tomorrow_local.astimezone(timezone.utc).replace(tzinfo=None),
        )
    # ZoneInfo unavailable – assume UTC
    base = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    base_naive = base.replace(tzinfo=None)
    return (
        base_naive,
        base_naive + timedelta(days=1),
        base_naive + timedelta(days=2),
    )


def record_reflection(
    db: Session,
    *,
    user_id: int,
    day: date,
    worked: Optional[str],
    challenging: Optional[str],
    summary: str,
    suggestion: str,
) -> DailyReflection:
    reflection = (
        db.query(DailyReflection)
        .filter(DailyReflection.user_id == user_id, DailyReflection.day == day)
        .first()
    )
    if reflection:
        reflection.worked = worked
        reflection.challenging = challenging
        reflection.summary = summary
        reflection.suggestion = suggestion
    else:
        reflection = DailyReflection(
            user_id=user_id,
            day=day,
            worked=worked,
            challenging=challenging,
            summary=summary,
            suggestion=suggestion,
        )
    db.add(reflection)
    db.commit()
    db.refresh(reflection)
    return reflection


def update_session_status(
    db: Session,
    *,
    user_id: int,
    session_ids: list[int],
    status: SessionStatus,
) -> None:
    """Update session status for multiple sessions. Requires user_id for security."""
    if not session_ids:
        return
    (
        db.query(StudySession)
        .filter(
            StudySession.id.in_(session_ids),
            StudySession.user_id == user_id,  # Security: ensure user can only update their own sessions
        )
        .update({"status": status}, synchronize_session=False)
    )
    db.commit()

