import json
from datetime import date, datetime

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api import deps
from app.db.session import get_db
from app.models.daily_reflection import DailyReflection
from app.models.study_session import StudySession
from app.models.subject import Subject
from app.models.task import Task
from app.models.user import User
from app.schemas.user import UserPublic, UserUpdate

router = APIRouter()


@router.get("/me", response_model=UserPublic)
def get_profile(current_user: User = Depends(deps.get_current_user)) -> UserPublic:
    return current_user


@router.patch("/me", response_model=UserPublic)
def update_profile(
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> UserPublic:
    data = payload.dict(exclude_unset=True)
    # Don't allow email change through this endpoint - use /auth/change-email instead
    data.pop("email", None)
    for key, value in data.items():
        setattr(current_user, key, value)
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/onboarding-status")
def get_onboarding_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> dict:
    """Compute whether the user has finished the essential onboarding steps."""
    has_subjects = db.query(Subject.id).filter(Subject.user_id == current_user.id).first() is not None
    has_tasks = (
        db.query(Task.id)
        .filter(Task.user_id == current_user.id, Task.is_recurring_template == False)  # noqa: E712
        .first()
        is not None
    )
    has_sessions = (
        db.query(StudySession.id)
        .filter(StudySession.user_id == current_user.id)
        .first()
        is not None
    )
    completed = has_subjects and has_tasks and has_sessions
    return {"completed": completed}


def _json_serial(obj: object) -> str:
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, date):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")


@router.get("/export")
def export_user_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Response:
    """Export all user data as a downloadable JSON file."""
    subjects = db.query(Subject).filter(Subject.user_id == current_user.id).all()
    tasks = db.query(Task).filter(Task.user_id == current_user.id).all()
    sessions = (
        db.query(StudySession)
        .filter(StudySession.user_id == current_user.id)
        .order_by(StudySession.start_time.asc())
        .all()
    )
    reflections = (
        db.query(DailyReflection)
        .filter(DailyReflection.user_id == current_user.id)
        .order_by(DailyReflection.day.asc())
        .all()
    )

    export = {
        "exported_at": datetime.now().astimezone().isoformat(),
        "user": {
            "email": current_user.email,
            "full_name": current_user.full_name,
            "timezone": current_user.timezone,
            "weekly_study_hours": current_user.weekly_study_hours,
            "max_session_length": current_user.max_session_length,
            "break_duration": current_user.break_duration,
            "preferred_study_windows": current_user.preferred_study_windows,
        },
        "subjects": [
            {
                "name": s.name,
                "color": s.color,
                "difficulty": getattr(s, "difficulty", None),
            }
            for s in subjects
        ],
        "tasks": [
            {
                "title": t.title,
                "subject": next((s.name for s in subjects if s.id == t.subject_id), None),
                "status": t.status,
                "priority": t.priority,
                "deadline": t.deadline,
                "estimated_minutes": t.estimated_minutes,
                "is_completed": t.is_completed,
                "completed_at": t.completed_at,
                "notes": getattr(t, "notes", None),
                "created_at": t.created_at,
            }
            for t in tasks
            if not t.is_recurring_template
        ],
        "study_sessions": [
            {
                "date": sess.start_time,
                "start_time": sess.start_time,
                "end_time": sess.end_time,
                "duration_minutes": int(
                    (sess.end_time - sess.start_time).total_seconds() / 60
                ),
                "status": sess.status.value if hasattr(sess.status, "value") else sess.status,
                "subject": next(
                    (s.name for s in subjects if s.id == sess.subject_id), None
                ),
                "energy_level": sess.energy_level,
                "notes": sess.notes,
            }
            for sess in sessions
        ],
        "reflections": [
            {
                "date": r.day,
                "worked": r.worked,
                "challenging": r.challenging,
                "summary": r.summary,
                "suggestion": r.suggestion,
            }
            for r in reflections
        ],
    }

    content = json.dumps(export, indent=2, default=_json_serial)
    filename = f"ssc-export-{date.today().isoformat()}.json"

    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

