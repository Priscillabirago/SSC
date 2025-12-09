from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api import deps
from app.coach.factory import get_coach_adapter
from app.db.session import get_db
from app.models.study_session import SessionStatus, StudySession
from app.models.user import User
from app.schemas.coach import SessionPreparationRequest, SessionPreparationResponse
from app.schemas.schedule import WeeklyPlan
from app.schemas.session import StudySessionPublic, StudySessionUpdate
from app.services import coach as coach_service
from app.services.scheduling import generate_weekly_schedule, micro_plan
from app.services.schedule_optimizer import build_schedule_context, apply_ai_optimizations
from app.services.workload_analyzer import analyze_pre_generation, analyze_post_generation
from app.models.subject import Subject
from app.models.task import Task
from app.models.constraint import ScheduleConstraint

router = APIRouter()


def _session_focus(session: StudySession) -> str | None:
    if session.task and session.task.title:
        return session.task.title
    if session.subject and session.subject.name:
        return session.subject.name
    if session.notes:
        return session.notes
    return None


def _serialize_session(session: StudySession) -> StudySessionPublic:
    # Eagerly load relationships if not already loaded
    if session.task:
        _ = session.task.title  # Trigger lazy load
    if session.subject:
        _ = session.subject.name  # Trigger lazy load
    
    # Ensure times are timezone-aware (UTC) for proper JSON serialization
    # Sessions are stored as naive UTC, so we need to make them aware
    from datetime import timezone
    start_time = session.start_time
    end_time = session.end_time
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)
    if end_time.tzinfo is None:
        end_time = end_time.replace(tzinfo=timezone.utc)
    
    return StudySessionPublic(
        id=session.id,
        user_id=session.user_id,
        subject_id=session.subject_id,
        task_id=session.task_id,
        start_time=start_time,
        end_time=end_time,
        status=session.status,
        energy_level=session.energy_level,
        generated_by=session.generated_by,
        focus=_session_focus(session),
    )


def _apply_ai_optimization(
    plan: WeeklyPlan, db: Session, current_user: User
) -> tuple[WeeklyPlan, str | None]:
    """Apply AI optimization to the schedule."""
    try:
        subjects = db.query(Subject).filter(Subject.user_id == current_user.id).all()
        tasks = db.query(Task).filter(Task.user_id == current_user.id).all()
        constraints = db.query(ScheduleConstraint).filter(
            ScheduleConstraint.user_id == current_user.id
        ).all()
        
        schedule_context = build_schedule_context(plan, tasks, subjects, constraints, db, current_user.id)
        user_context = coach_service.build_coach_context(db, current_user)
        
        adapter = get_coach_adapter()
        ai_suggestions = adapter.optimize_schedule(
            current_user, schedule_context, user_context
        )
        
        user_prefs = {
            "weekly_hours": current_user.weekly_study_hours,
            "max_session": current_user.max_session_length,
            "break_duration": current_user.break_duration,
        }
        optimized_plan, explanation = apply_ai_optimizations(
            plan, ai_suggestions, user_prefs
        )
        return optimized_plan, explanation
    except Exception as e:
        import logging
        logging.warning(f"AI schedule optimization failed: {e}")
        return plan, None


def _normalize_window_times(window_start: datetime, window_end: datetime) -> tuple[datetime, datetime]:
    """Normalize window times to naive UTC for database comparison."""
    if window_start.tzinfo is None:
        window_start_utc = window_start.replace(tzinfo=timezone.utc)
    else:
        window_start_utc = window_start.astimezone(timezone.utc)
    
    if window_end.tzinfo is None:
        window_end_utc = window_end.replace(tzinfo=timezone.utc)
    else:
        window_end_utc = window_end.astimezone(timezone.utc)
    
    return window_start_utc.replace(tzinfo=None), window_end_utc.replace(tzinfo=None)


def _sessions_overlap(
    start1: datetime, end1: datetime, start2: datetime, end2: datetime
) -> bool:
    """Check if two time ranges overlap."""
    return not (end1 <= start2 or start1 >= end2)


def _persist_sessions_to_db(
    plan: WeeklyPlan, db: Session, current_user: User
) -> None:
    """Delete old PLANNED sessions and persist new ones, preserving COMPLETED/PARTIAL sessions."""
    window_start = plan.days[0].day
    window_end = plan.days[-1].day + timedelta(days=1)
    window_start_naive, window_end_naive = _normalize_window_times(window_start, window_end)
    
    # Only delete PLANNED and SKIPPED sessions - preserve COMPLETED and PARTIAL
    (
        db.query(StudySession)
        .filter(
            StudySession.user_id == current_user.id,
            StudySession.start_time >= window_start_naive,
            StudySession.start_time < window_end_naive,
            StudySession.status.in_([SessionStatus.PLANNED, SessionStatus.SKIPPED]),
        )
        .delete(synchronize_session=False)
    )
    
    # Get preserved sessions to avoid time conflicts
    preserved_sessions = (
        db.query(StudySession)
        .filter(
            StudySession.user_id == current_user.id,
            StudySession.start_time >= window_start_naive,
            StudySession.start_time < window_end_naive,
            StudySession.status.in_([SessionStatus.COMPLETED, SessionStatus.PARTIAL]),
        )
        .all()
    )
    
    # Add new sessions, avoiding conflicts with preserved ones
    for day in plan.days:
        for block in day.sessions:
            # Check for any overlap with preserved sessions
            has_overlap = any(
                _sessions_overlap(
                    block.start_time, block.end_time,
                    preserved.start_time, preserved.end_time
                )
                for preserved in preserved_sessions
            )
            if has_overlap:
                continue  # Skip overlapping sessions to preserve completed work
            
            session = StudySession(
                user_id=current_user.id,
                subject_id=block.subject_id,
                task_id=block.task_id,
                start_time=block.start_time,
                end_time=block.end_time,
                status=SessionStatus.PLANNED,
                energy_level=block.energy_level,
                generated_by=block.generated_by,
            )
            db.add(session)
    db.commit()


@router.post("/generate", response_model=WeeklyPlan)
def generate_week_plan(
    use_ai_optimization: bool = Query(default=False, description="Enable AI optimization for better real-world efficiency"),
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> WeeklyPlan:
    """Generate a weekly study schedule.
    
    Args:
        use_ai_optimization: If True, AI will review and optimize the schedule
                            for better real-world efficiency (workload balancing,
                            circadian matching, etc.). Defaults to False.
    """
    plan, rescheduling_info = generate_weekly_schedule(db, current_user)
    
    optimization_explanation = None
    if use_ai_optimization:
        plan, optimization_explanation = _apply_ai_optimization(plan, db, current_user)
    
    # Combine rescheduling summary with optimization explanation if both exist
    combined_explanation_parts = []
    if rescheduling_info.get("summary"):
        combined_explanation_parts.append(f"📅 {rescheduling_info['summary']}")
    if optimization_explanation:
        combined_explanation_parts.append(optimization_explanation)
    
    final_explanation = "\n\n".join(combined_explanation_parts) if combined_explanation_parts else None
    
    if final_explanation:
        plan = WeeklyPlan(
            user_id=plan.user_id,
            generated_at=plan.generated_at,
            days=plan.days,
            optimization_explanation=final_explanation
        )
    
    if plan.days:
        _persist_sessions_to_db(plan, db, current_user)
    
    return plan


@router.get("/workload-analysis")
def get_workload_analysis(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> dict[str, Any]:
    """Get workload analysis and warnings before generating schedule.
    
    This is a read-only analysis that does not modify any data.
    Returns warnings and suggestions for the user.
    """
    analysis = analyze_pre_generation(db, current_user)
    return analysis


@router.post("/analyze")
def analyze_schedule(
    plan: WeeklyPlan,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> dict[str, Any]:
    """Analyze a generated schedule for workload issues.
    
    This is a read-only analysis that does not modify any data.
    Takes a WeeklyPlan and returns post-generation warnings.
    """
    analysis = analyze_post_generation(plan, db, current_user)
    return analysis


@router.get("/sessions", response_model=list[StudySessionPublic])
def list_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> list[StudySessionPublic]:
    from sqlalchemy.orm import joinedload
    now = datetime.now(timezone.utc) - timedelta(hours=1)
    sessions = (
        db.query(StudySession)
        .options(joinedload(StudySession.task), joinedload(StudySession.subject))
        .filter(StudySession.user_id == current_user.id, StudySession.end_time >= now)
        .order_by(StudySession.start_time.asc())
        .all()
    )
    return [_serialize_session(session) for session in sessions]


@router.post("/micro", response_model=list[StudySessionPublic])
def micro_plan_endpoint(
    minutes: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> list[StudySessionPublic]:
    blocks = micro_plan(db, current_user, minutes)
    sessions: list[StudySessionPublic] = []
    for idx, block in enumerate(blocks):
        sessions.append(
            StudySessionPublic(
                id=-(idx + 1),
                user_id=current_user.id,
                subject_id=block.subject_id,
                task_id=block.task_id,
                start_time=block.start_time,
                end_time=block.end_time,
                status=SessionStatus.PLANNED,
                energy_level=block.energy_level,
                generated_by=block.generated_by,
                focus=block.focus,
            )
        )
    return sessions


def _normalize_to_utc(dt: datetime) -> datetime:
    """Normalize a datetime to UTC-aware for comparison.
    
    Handles both naive datetimes (assumed UTC from database) and
    timezone-aware datetimes (from API requests with timezone info).
    """
    if dt.tzinfo is None:
        # Naive datetime - assume UTC (database storage format)
        return dt.replace(tzinfo=timezone.utc)
    else:
        # Aware datetime - convert to UTC
        return dt.astimezone(timezone.utc)


def _calculate_missing_time(
    session: StudySession, payload: StudySessionUpdate
) -> None:
    """Calculate missing start_time or end_time based on duration."""
    if payload.start_time is not None and payload.end_time is None:
        duration = session.end_time - session.start_time
        payload.end_time = payload.start_time + duration
    elif payload.end_time is not None and payload.start_time is None:
        duration = session.end_time - session.start_time
        payload.start_time = payload.end_time - duration


def _validate_session_times(payload: StudySessionUpdate) -> None:
    """Validate that start_time is before end_time."""
    from fastapi import HTTPException, status
    
    if payload.start_time is not None and payload.end_time is not None:
        if payload.start_time >= payload.end_time:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Start time must be before end time"
            )


def _check_session_conflict(
    db: Session, user_id: int, session_id: int, start_time: datetime, end_time: datetime
) -> StudySession | None:
    """Check for conflicting sessions.
    
    Excludes COMPLETED sessions but includes PLANNED, PARTIAL, and SKIPPED sessions
    since PARTIAL sessions may still have remaining time scheduled.
    """
    return (
        db.query(StudySession)
        .filter(
            StudySession.user_id == user_id,
            StudySession.id != session_id,
            StudySession.status != SessionStatus.COMPLETED,
            start_time < StudySession.end_time,
            end_time > StudySession.start_time,
        )
        .first()
    )


def _get_conflict_name(conflicting_session: StudySession) -> str:
    """Get the name of a conflicting session."""
    conflict_task = conflicting_session.task
    conflict_subject = conflicting_session.subject
    if conflict_task:
        return conflict_task.title
    if conflict_subject:
        return conflict_subject.name
    return "another session"


def _is_session_shortening(session: StudySession, payload: StudySessionUpdate) -> bool:
    """Check if the session is being shortened (end earlier or start later)."""
    if payload.end_time is not None and payload.start_time is None:
        new_end_utc = _normalize_to_utc(payload.end_time)
        session_end_utc = _normalize_to_utc(session.end_time)
        return new_end_utc < session_end_utc
    if payload.start_time is not None and payload.end_time is None:
        new_start_utc = _normalize_to_utc(payload.start_time)
        session_start_utc = _normalize_to_utc(session.start_time)
        return new_start_utc > session_start_utc
    return False


def _update_session_times_shortening(session: StudySession, payload: StudySessionUpdate) -> None:
    """Update session times when shortening (no conflict check needed).
    
    Note: Shortening can't create new conflicts, only remove them.
    However, we still validate to ensure times are valid.
    """
    from fastapi import HTTPException, status
    
    _calculate_missing_time(session, payload)
    _validate_session_times(payload)
    
    # Validate duration (5 minutes to 8 hours) even when shortening
    if payload.start_time is not None and payload.end_time is not None:
        duration_minutes = int((payload.end_time - payload.start_time).total_seconds() // 60)
        if duration_minutes < 5:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Session duration must be at least 5 minutes."
            )
        if duration_minutes > 480:  # 8 hours
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Session duration cannot exceed 8 hours."
            )
    
    # Ensure times are naive UTC (strip timezone if present)
    if payload.start_time is not None:
        if payload.start_time.tzinfo is not None:
            session.start_time = payload.start_time.astimezone(timezone.utc).replace(tzinfo=None)
        else:
            session.start_time = payload.start_time
    if payload.end_time is not None:
        if payload.end_time.tzinfo is not None:
            session.end_time = payload.end_time.astimezone(timezone.utc).replace(tzinfo=None)
        else:
            session.end_time = payload.end_time


def _update_session_times(
    session: StudySession, payload: StudySessionUpdate, db: Session, current_user: User, session_id: int
) -> None:
    """Update session start/end times with validation and conflict checking."""
    from fastapi import HTTPException, status
    
    _calculate_missing_time(session, payload)
    _validate_session_times(payload)
    
    # Normalize times to naive UTC for conflict checking
    start_time_check = payload.start_time
    end_time_check = payload.end_time
    if start_time_check.tzinfo is not None:
        start_time_check = start_time_check.astimezone(timezone.utc).replace(tzinfo=None)
    if end_time_check.tzinfo is not None:
        end_time_check = end_time_check.astimezone(timezone.utc).replace(tzinfo=None)
    
    conflicting_session = _check_session_conflict(
        db, current_user.id, session_id, start_time_check, end_time_check
    )
    
    if conflicting_session:
        conflict_name = _get_conflict_name(conflicting_session)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This time conflicts with: {conflict_name} ({conflicting_session.start_time.strftime('%I:%M %p')} - {conflicting_session.end_time.strftime('%I:%M %p')})"
        )
    
    # Store as naive UTC (strip timezone if present)
    if start_time_check.tzinfo is not None:
        session.start_time = start_time_check.astimezone(timezone.utc).replace(tzinfo=None)
    else:
        session.start_time = start_time_check
    if end_time_check.tzinfo is not None:
        session.end_time = end_time_check.astimezone(timezone.utc).replace(tzinfo=None)
    else:
        session.end_time = end_time_check


def _handle_recurring_task_completion(db: Session, task: Task) -> None:
    """Handle recurring task instance generation on completion."""
    if task.recurring_template_id and not task.is_recurring_template:
        try:
            from app.services import recurring_tasks
            recurring_tasks.generate_next_instance_on_completion(db, task)
        except Exception:
            pass


def _update_task_completion_status(db: Session, task: Task, total_time: int, estimated_minutes: int) -> None:
    """Update task completion status based on time spent."""
    if total_time >= estimated_minutes:
        if not task.is_completed:
            task.is_completed = True
            task.status = "completed"
            _handle_recurring_task_completion(db, task)
    elif task.is_completed and total_time < estimated_minutes:
        from app.models.task import TaskStatus
        if task.status == "completed" or task.status == TaskStatus.COMPLETED.value:
            task.is_completed = False
            task.status = TaskStatus.TODO.value


def _update_task_progress_from_session(
    db: Session, task: Task, current_user: User
) -> None:
    """Update task progress based on completed/partial sessions."""
    from app.models.study_session import SessionStatus as SS
    
    all_sessions_for_task = (
        db.query(StudySession)
        .filter(
            StudySession.task_id == task.id,
            StudySession.user_id == current_user.id,
            StudySession.status.in_([SS.COMPLETED, SS.PARTIAL])
        )
        .all()
    )
    
    session_time_minutes = sum(
        int((s.end_time - s.start_time).total_seconds() // 60)
        for s in all_sessions_for_task
    )
    
    task.actual_minutes_spent = session_time_minutes if session_time_minutes > 0 else None
    total_time = task.total_minutes_spent
    
    _update_task_completion_status(db, task, total_time, task.estimated_minutes)
    
    db.add(task)
    db.commit()


@router.patch("/sessions/{session_id}", response_model=StudySessionPublic)
def update_session(
    session_id: int,
    payload: StudySessionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> StudySessionPublic:
    from fastapi import HTTPException, status
    
    session = _get_session_or_404(db, session_id, current_user.id)
    
    # Prevent modifying COMPLETED sessions (they're historical records)
    if session.status == SessionStatus.COMPLETED and (payload.start_time is not None or payload.end_time is not None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot reschedule a completed session. Please create a new session instead."
        )
    
    if payload.status is not None:
        session.status = payload.status
    if payload.notes is not None:
        session.notes = payload.notes
    
    if payload.start_time is not None or payload.end_time is not None:
        # Validate duration if both times are provided
        if payload.start_time is not None and payload.end_time is not None:
            duration = (payload.end_time - payload.start_time).total_seconds() / 60
            if duration < 5:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Session must be at least 5 minutes long."
                )
            if duration > 480:  # 8 hours
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Session cannot be longer than 8 hours."
                )
        
        if _is_session_shortening(session, payload):
            _update_session_times_shortening(session, payload)
        else:
            _update_session_times(session, payload, db, current_user, session_id)
    
    db.add(session)
    db.commit()
    
    # Auto-update task progress when session status changes
    if session.task_id and payload.status is not None:
        from app.models.task import Task
        task = db.query(Task).filter(Task.id == session.task_id, Task.user_id == current_user.id).first()
        if task:
            _update_task_progress_from_session(db, task, current_user)
    
    db.refresh(session)
    return _serialize_session(session)


def _get_session_or_404(
    db: Session, session_id: int, user_id: int
) -> StudySession:
    """Get session with relationships loaded or raise 404."""
    from sqlalchemy.orm import joinedload
    from fastapi import HTTPException, status
    
    session = (
        db.query(StudySession)
        .options(joinedload(StudySession.task), joinedload(StudySession.subject))
        .filter(StudySession.id == session_id, StudySession.user_id == user_id)
        .first()
    )
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )
    return session


def _determine_time_of_day(session_time: datetime) -> str:
    """Determine time of day from session start time."""
    from datetime import timezone
    
    if session_time.tzinfo is None:
        session_time = session_time.replace(tzinfo=timezone.utc)
    hour = session_time.hour
    if 5 <= hour < 12:
        return "morning"
    if 12 <= hour < 17:
        return "afternoon"
    if 17 <= hour < 21:
        return "evening"
    return "night"


def _calculate_deadline_proximity(task) -> str:
    """Calculate deadline proximity string."""
    from datetime import datetime, timezone
    
    if not task or not task.deadline:
        return ""
    
    now = datetime.now(timezone.utc)
    task_deadline = task.deadline.replace(tzinfo=timezone.utc) if task.deadline.tzinfo is None else task.deadline
    days_until = (task_deadline - now).days
    
    if days_until < 0:
        return "overdue"
    if days_until == 0:
        return "due today"
    if days_until <= 7:
        return f"due in {days_until} days"
    return ""


def _process_subtasks(task) -> list[dict]:
    """Process task subtasks into list of dicts."""
    if not task or not task.subtasks or not isinstance(task.subtasks, list):
        return []
    
    subtasks_list = []
    for st in task.subtasks:
        if isinstance(st, dict):
            subtasks_list.append({"title": st.get("title", ""), "completed": st.get("completed", False)})
        else:
            subtasks_list.append({"title": getattr(st, "title", ""), "completed": getattr(st, "completed", False)})
    return subtasks_list


def _build_session_context(session: StudySession, task, subject) -> dict:
    """Build session context dictionary for AI."""
    duration_minutes = int((session.end_time - session.start_time).total_seconds() // 60)
    time_of_day = _determine_time_of_day(session.start_time)
    deadline_proximity = _calculate_deadline_proximity(task)
    subtasks_list = _process_subtasks(task)
    
    if task:
        task_title = task.title
    elif subject:
        task_title = subject.name
    else:
        task_title = "Study session"
    
    subject_difficulty = subject.difficulty.value if subject and subject.difficulty else ""
    is_academic_task = bool(subject) or (task and task.subject_id is not None)
    
    return {
        "task_title": task_title,
        "task_description": task.description if task else "",
        "subtasks": subtasks_list,
        "subject_name": subject.name if subject else "",
        "subject_difficulty": subject_difficulty,
        "duration_minutes": duration_minutes,
        "time_of_day": time_of_day,
        "deadline_proximity": deadline_proximity,
        "priority": task.priority.value if task else "medium",
        "is_academic": is_academic_task,
    }


@router.post("/sessions/{session_id}/prepare", response_model=SessionPreparationResponse)
def prepare_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> SessionPreparationResponse:
    """Get AI-powered study preparation suggestions for a session."""
    session = _get_session_or_404(db, session_id, current_user.id)
    task = session.task
    subject = session.subject
    
    session_context = _build_session_context(session, task, subject)
    
    adapter = get_coach_adapter()
    user_context = coach_service.build_coach_context(db, current_user)
    response = adapter.prepare_session(current_user, session_context, user_context)
    
    return SessionPreparationResponse(
        tips=response.get("tips", []),
        strategy=response.get("strategy", "Active Recall"),
        rationale=response.get("rationale", "Evidence-based study methods improve retention and efficiency.")
    )

