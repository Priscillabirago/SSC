import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api import deps
from app.coach.factory import get_coach_adapter
from app.db.session import get_db
from app.models.study_session import SessionStatus, StudySession
from app.models.user import User
from app.schemas.coach import SessionPreparationRequest, SessionPreparationResponse
from app.schemas.schedule import WeeklyPlan
from app.schemas.session import StudySessionPublic, StudySessionUpdate, StudySessionCreate
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
        is_pinned=session.is_pinned,
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
    """Check if two time ranges overlap.
    
    Normalizes datetimes to naive UTC before comparison to handle
    potential timezone-aware vs naive datetime mismatches.
    """
    # Normalize all datetimes to naive (remove tzinfo) for consistent comparison
    def to_naive(dt: datetime) -> datetime:
        if dt.tzinfo is not None:
            return dt.replace(tzinfo=None)
        return dt
    
    s1, e1, s2, e2 = to_naive(start1), to_naive(end1), to_naive(start2), to_naive(end2)
    return not (e1 <= s2 or s1 >= e2)


def _persist_sessions_to_db(
    plan: WeeklyPlan, db: Session, current_user: User
) -> None:
    """Delete old PLANNED sessions and persist new ones, preserving active, completed, and pinned sessions.
    
    Preserves: COMPLETED, PARTIAL, IN_PROGRESS (active focus sessions), and any PINNED sessions
    Deletes: PLANNED, SKIPPED (only if not pinned)
    
    Uses a transaction to ensure atomicity - either all changes succeed or none do.
    This prevents issues with multiple rapid regenerations.
    """
    window_start = plan.days[0].day
    window_end = plan.days[-1].day + timedelta(days=1)
    window_start_naive, window_end_naive = _normalize_window_times(window_start, window_end)
    
    try:
        # Get preserved sessions BEFORE deletion to avoid race conditions
        # Include IN_PROGRESS to protect active focus sessions from deletion
        # Also include any pinned sessions regardless of status
        from sqlalchemy import or_
        preserved_sessions = (
            db.query(StudySession)
            .filter(
                StudySession.user_id == current_user.id,
                StudySession.start_time >= window_start_naive,
                StudySession.start_time < window_end_naive,
                or_(
                    StudySession.status.in_([
                        SessionStatus.COMPLETED, 
                        SessionStatus.PARTIAL,
                        SessionStatus.IN_PROGRESS
                    ]),
                    StudySession.is_pinned == True
                ),
            )
            .all()
        )
        
        # Only delete PLANNED and SKIPPED sessions that are NOT pinned
        # Preserve: COMPLETED, PARTIAL, IN_PROGRESS, and all PINNED sessions
        # Use or_(is_pinned == False, is_pinned.is_(None)) to handle NULL values
        from sqlalchemy import or_ as sql_or
        (
            db.query(StudySession)
            .filter(
                StudySession.user_id == current_user.id,
                StudySession.start_time >= window_start_naive,
                StudySession.start_time < window_end_naive,
                StudySession.status.in_([SessionStatus.PLANNED, SessionStatus.SKIPPED]),
                sql_or(StudySession.is_pinned == False, StudySession.is_pinned.is_(None)),  # Don't delete pinned sessions
            )
            .delete(synchronize_session=False)
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
    except Exception:
        db.rollback()
        raise


def _round_to_nearest_minutes(dt: datetime, minutes: int = 5) -> datetime:
    """Round datetime to nearest N minutes for consistent scheduling."""
    # Round to nearest N minutes
    total_seconds = dt.minute * 60 + dt.second
    rounded_minutes = round(total_seconds / (minutes * 60)) * minutes
    return dt.replace(minute=rounded_minutes % 60, second=0, microsecond=0)


def _cleanup_stale_sessions(db: Session, user_id: int, now_utc: datetime) -> dict[str, int]:
    """Clean up stale IN_PROGRESS and missed PLANNED sessions before regeneration.
    
    Returns:
        Dict with counts: {"stale_in_progress": N, "missed_planned": N}
    """
    # 1. Mark stale IN_PROGRESS sessions as PARTIAL
    # These are sessions where user started focus mode but never completed
    # (browser crash, closed tab, etc.)
    stale_threshold = now_utc - timedelta(hours=2)
    
    stale_in_progress = (
        db.query(StudySession)
        .filter(
            StudySession.user_id == user_id,
            StudySession.status == SessionStatus.IN_PROGRESS,
            StudySession.end_time < stale_threshold
        )
        .all()
    )
    
    for session in stale_in_progress:
        session.status = SessionStatus.PARTIAL
    
    # 2. Mark missed PLANNED sessions as SKIPPED
    # These are sessions that were never started and are now in the past
    # 15 minute grace period in case user is just running late
    missed_threshold = now_utc - timedelta(minutes=15)
    
    missed_planned = (
        db.query(StudySession)
        .filter(
            StudySession.user_id == user_id,
            StudySession.status == SessionStatus.PLANNED,
            StudySession.end_time < missed_threshold
        )
        .all()
    )
    
    for session in missed_planned:
        session.status = SessionStatus.SKIPPED
    
    if stale_in_progress or missed_planned:
        db.flush()  # Flush changes before continuing
    
    return {
        "stale_in_progress": len(stale_in_progress),
        "missed_planned": len(missed_planned)
    }


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
    
    Note: Uses current time (rounded to nearest 5 minutes) as reference to ensure
    sessions are only scheduled from now forward. This prevents scheduling in the past
    while maintaining consistency across rapid regenerations.
    """
    from zoneinfo import ZoneInfo
    try:
        user_tz = ZoneInfo(current_user.timezone)
    except Exception:
        user_tz = ZoneInfo("UTC")
    
    # Use actual current time, rounded to nearest 5 minutes for consistency
    # This ensures sessions are scheduled from "now" forward, not from midnight
    now_utc = datetime.now(timezone.utc)
    reference_time = _round_to_nearest_minutes(now_utc, minutes=5)
    
    # Clean up stale and missed sessions before generating new schedule
    cleanup_counts = _cleanup_stale_sessions(db, current_user.id, now_utc)
    
    plan, rescheduling_info = generate_weekly_schedule(db, current_user, reference=reference_time)
    
    optimization_explanation = None
    if use_ai_optimization:
        plan, optimization_explanation = _apply_ai_optimization(plan, db, current_user)
    
    # Combine all explanations: cleanup info, rescheduling summary, and optimization
    combined_explanation_parts = []
    
    # Add cleanup notification if any sessions were affected
    cleanup_messages = []
    if cleanup_counts["stale_in_progress"] > 0:
        cleanup_messages.append(f"{cleanup_counts['stale_in_progress']} incomplete session(s) marked as partial")
    if cleanup_counts["missed_planned"] > 0:
        cleanup_messages.append(f"{cleanup_counts['missed_planned']} past session(s) marked as skipped")
    if cleanup_messages:
        combined_explanation_parts.append("📋 " + ", ".join(cleanup_messages))
    
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
    """List sessions from start of today (in user's timezone) and all future sessions.
    
    This ensures users can see and manage all sessions for the current day,
    even if they forgot to mark one as completed earlier.
    """
    from sqlalchemy.orm import joinedload
    from zoneinfo import ZoneInfo
    
    # Get start of today in user's timezone
    try:
        user_tz = ZoneInfo(current_user.timezone)
    except Exception:
        user_tz = ZoneInfo("UTC")
    
    now_local = datetime.now(user_tz)
    today_start_local = datetime.combine(now_local.date(), datetime.min.time()).replace(tzinfo=user_tz)
    today_start_utc = today_start_local.astimezone(timezone.utc).replace(tzinfo=None)
    
    sessions = (
        db.query(StudySession)
        .options(joinedload(StudySession.task), joinedload(StudySession.subject))
        .filter(
            StudySession.user_id == current_user.id,
            StudySession.start_time >= today_start_utc  # All sessions from today onwards
        )
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
        # Show times in user's timezone (sessions are stored as naive UTC)
        try:
            user_tz = ZoneInfo(current_user.timezone or "UTC")
        except Exception:
            user_tz = ZoneInfo("UTC")
        conflict_start = conflicting_session.start_time.replace(tzinfo=timezone.utc).astimezone(user_tz)
        conflict_end = conflicting_session.end_time.replace(tzinfo=timezone.utc).astimezone(user_tz)
        time_str = f"{conflict_start.strftime('%I:%M %p')} - {conflict_end.strftime('%I:%M %p')}"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This time conflicts with: {conflict_name} ({time_str})"
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
    """Update task completion status based on time spent.
    
    Auto-completes tasks when total_time >= estimated_minutes.
    However, if a task was manually unmarked (user unchecked it after auto-completion),
    it won't auto-complete again - user must manually mark it complete.
    
    Respects manual completion: If a user manually completed a task, it won't be auto-uncompleted
    even if time drops below the estimate.
    """
    if total_time >= estimated_minutes:
        # Only auto-complete if task is not already completed
        # AND user hasn't disabled auto-completion (by manually unmarking it)
        if not task.is_completed and not task.prevent_auto_completion:
            task.is_completed = True
            task.status = "completed"
            # Set completed_at when marking as complete
            if not task.completed_at:
                from datetime import datetime, timezone
                task.completed_at = datetime.now(timezone.utc)
            _handle_recurring_task_completion(db, task)
    elif task.is_completed and total_time < estimated_minutes:
        # Only auto-uncomplete if the task was auto-completed, not manually completed
        # Check if it was likely manually completed:
        # 1. If prevent_auto_completion is True, user manually completed it early (don't uncomplete)
        # 2. If completed_at was set recently (within last hour), assume it was manual (don't uncomplete)
        from datetime import datetime, timezone, timedelta
        from app.models.task import TaskStatus
        
        # Check if task was recently manually completed
        was_recently_manually_completed = False
        if task.completed_at:
            now = datetime.now(timezone.utc)
            # If completed_at is timezone-naive, assume UTC
            completed_at_aware = task.completed_at
            if completed_at_aware.tzinfo is None:
                completed_at_aware = completed_at_aware.replace(tzinfo=timezone.utc)
            # If completed within last hour, assume it was manual
            if (now - completed_at_aware) < timedelta(hours=1):
                was_recently_manually_completed = True
        
        # Only auto-uncomplete if:
        # - It wasn't recently manually completed (completed_at check)
        # - prevent_auto_completion is False (user didn't manually complete it early)
        if not was_recently_manually_completed and not task.prevent_auto_completion:
            # This was likely auto-completed, safe to uncomplete
            if task.status == "completed" or task.status == TaskStatus.COMPLETED.value:
                task.is_completed = False
                task.status = TaskStatus.TODO.value
                # Clear completed_at when unmarking as complete
                task.completed_at = None
        # If it was manually completed (either recently or prevent_auto_completion is True),
        # respect the user's choice and don't auto-uncomplete


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
    # SessionStatus is imported at module level (line 10)
    if session.status == SessionStatus.COMPLETED and (payload.start_time is not None or payload.end_time is not None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot reschedule a completed session. Please create a new session instead."
        )
    
    if payload.status is not None:
        session.status = payload.status
    if payload.notes is not None:
        session.notes = payload.notes
    if payload.is_pinned is not None:
        session.is_pinned = payload.is_pinned
    
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
    
    # Auto-update task progress when:
    # 1. Session status changes (completed/partial)
    # 2. Session times change for completed/partial sessions (affects actual_minutes_spent)
    if session.task_id:
        from app.models.task import Task
        should_update = (
            payload.status is not None  # Status changed
            or (
                (payload.start_time is not None or payload.end_time is not None)
                and session.status in [SessionStatus.COMPLETED, SessionStatus.PARTIAL]
            )  # Times changed for completed/partial session
        )
        if should_update:
            task = db.query(Task).filter(Task.id == session.task_id, Task.user_id == current_user.id).first()
            if task:
                _update_task_progress_from_session(db, task, current_user)
    
    db.refresh(session)
    return _serialize_session(session)


@router.post("/sessions", response_model=StudySessionPublic)
def create_session(
    payload: StudySessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> StudySessionPublic:
    """Create a manual study session.
    
    Manual sessions are pinned by default, meaning they won't be deleted
    when the schedule is regenerated. This allows users to schedule specific
    tasks at specific times that persist across regenerations.
    
    Args:
        payload: Session creation data including task_id, subject_id, start_time, end_time
        
    Returns:
        The created session
        
    Raises:
        HTTPException 400: If session duration is invalid or times conflict with existing sessions
        HTTPException 404: If referenced task or subject doesn't exist
    """
    from fastapi import HTTPException, status
    from datetime import timezone
    
    # Validate duration
    duration_minutes = (payload.end_time - payload.start_time).total_seconds() / 60
    if duration_minutes < 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session must be at least 5 minutes long."
        )
    if duration_minutes > 480:  # 8 hours
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session cannot be longer than 8 hours."
        )
    
    # Validate task if provided
    if payload.task_id is not None:
        task = db.query(Task).filter(
            Task.id == payload.task_id,
            Task.user_id == current_user.id
        ).first()
        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found."
            )
    
    # Validate subject if provided
    if payload.subject_id is not None:
        subject = db.query(Subject).filter(
            Subject.id == payload.subject_id,
            Subject.user_id == current_user.id
        ).first()
        if not subject:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Subject not found."
            )
    
    # Convert times to naive UTC for storage
    start_time = payload.start_time
    end_time = payload.end_time
    if start_time.tzinfo is not None:
        start_time = start_time.astimezone(timezone.utc).replace(tzinfo=None)
    if end_time.tzinfo is not None:
        end_time = end_time.astimezone(timezone.utc).replace(tzinfo=None)
    
    # Note: We allow creating overlapping sessions for flexibility
    # The frontend can warn users about conflicts if needed
    
    # Create the session
    session = StudySession(
        user_id=current_user.id,
        task_id=payload.task_id,
        subject_id=payload.subject_id,
        start_time=start_time,
        end_time=end_time,
        status=SessionStatus.PLANNED,
        is_pinned=payload.is_pinned,  # True by default for manual sessions
        generated_by="manual",
    )
    
    db.add(session)
    db.commit()
    db.refresh(session)
    
    return _serialize_session(session)


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> None:
    """Delete a manual/pinned session.
    
    Only allows deleting sessions that are:
    - PLANNED or SKIPPED status (not COMPLETED, PARTIAL, or IN_PROGRESS)
    - Either pinned (is_pinned=True) or manually created (generated_by='manual')
    
    This prevents accidental deletion of:
    - Completed sessions (historical records)
    - Active sessions (in progress)
    - Scheduler-generated sessions (use 'skip' instead, regenerate to replace)
    """
    from fastapi import HTTPException, status
    
    session = _get_session_or_404(db, session_id, current_user.id)
    
    # Only allow deleting PLANNED or SKIPPED sessions
    if session.status not in [SessionStatus.PLANNED, SessionStatus.SKIPPED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete a {session.status.value} session. Only planned or skipped sessions can be deleted."
        )
    
    # Only allow deleting pinned or manual sessions
    is_manual_or_pinned = session.is_pinned or session.generated_by == "manual"
    if not is_manual_or_pinned:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete scheduler-generated sessions. Mark as skipped and regenerate your schedule instead."
        )
    
    db.delete(session)
    db.commit()


@router.post("/sessions/{session_id}/start", response_model=StudySessionPublic)
def start_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> StudySessionPublic:
    """Mark a session as IN_PROGRESS when user starts focus mode.
    
    This protects the session from being deleted during schedule regeneration.
    If another session is already IN_PROGRESS, it will be auto-completed as PARTIAL.
    
    Returns:
        The updated session with IN_PROGRESS status
    """
    from fastapi import HTTPException, status
    
    session = _get_session_or_404(db, session_id, current_user.id)
    
    # Validate that the session can be started
    if session.status == SessionStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot start a completed session."
        )
    if session.status == SessionStatus.IN_PROGRESS:
        # Already in progress, just return it
        return _serialize_session(session)
    
    # Handle any existing IN_PROGRESS sessions (e.g., from another device/tab)
    # Mark them as PARTIAL since user is starting a new session
    existing_in_progress = (
        db.query(StudySession)
        .filter(
            StudySession.user_id == current_user.id,
            StudySession.status == SessionStatus.IN_PROGRESS,
            StudySession.id != session_id
        )
        .all()
    )
    
    for old_session in existing_in_progress:
        old_session.status = SessionStatus.PARTIAL
        db.add(old_session)
    
    # Mark the requested session as IN_PROGRESS
    session.status = SessionStatus.IN_PROGRESS
    db.add(session)
    db.commit()
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


def _determine_time_of_day(session_time: datetime, user_tz_str: str = "UTC") -> str:
    """Determine time of day from session start time in user's local timezone."""
    from datetime import timezone
    from zoneinfo import ZoneInfo
    
    if session_time.tzinfo is None:
        session_time = session_time.replace(tzinfo=timezone.utc)
    
    # Convert to user's local timezone for proper time-of-day detection
    try:
        user_tz = ZoneInfo(user_tz_str)
        local_time = session_time.astimezone(user_tz)
    except Exception:
        local_time = session_time
    
    hour = local_time.hour
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


def _build_session_context(session: StudySession, task, subject, user_tz: str = "UTC") -> dict:
    """Build session context dictionary for AI."""
    duration_minutes = int((session.end_time - session.start_time).total_seconds() // 60)
    time_of_day = _determine_time_of_day(session.start_time, user_tz)
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
        "task_notes": task.notes if task else "",
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
    
    session_context = _build_session_context(session, task, subject, current_user.timezone)
    
    adapter = get_coach_adapter()
    user_context = coach_service.build_coach_context(db, current_user)
    response = adapter.prepare_session(current_user, session_context, user_context)
    
    return SessionPreparationResponse(
        tips=response.get("tips", []),
        strategy=response.get("strategy", "Active Recall"),
        rationale=response.get("rationale", "Evidence-based study methods improve retention and efficiency.")
    )


# ---------------------------------------------------------------------------
# Calendar export endpoints
# ---------------------------------------------------------------------------

_ICAL_DAY_ABBR = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]


def _build_ics_calendar(
    sessions: list[StudySession],
    constraints: list[ScheduleConstraint],
    user: User,
) -> bytes:
    """Build an iCalendar (.ics) file from study sessions and constraints."""
    from icalendar import Calendar, Event

    cal = Calendar()
    cal.add("prodid", "-//Smart Study Companion//SSC//EN")
    cal.add("version", "2.0")
    cal.add("calscale", "GREGORIAN")
    cal.add("x-wr-calname", "SSC Study Sessions")
    cal.add("x-wr-timezone", user.timezone or "UTC")
    cal.add("x-published-ttl", "PT1H")

    # --- study sessions ---
    for session in sessions:
        event = Event()
        event.add("uid", f"ssc-session-{session.id}@smartstudycompanion")

        focus = _session_focus(session) or "Study Session"
        event.add("summary", focus)

        start = session.start_time.replace(tzinfo=timezone.utc) if session.start_time.tzinfo is None else session.start_time
        end = session.end_time.replace(tzinfo=timezone.utc) if session.end_time.tzinfo is None else session.end_time
        event.add("dtstart", start)
        event.add("dtend", end)

        desc_parts: list[str] = []
        if session.subject:
            desc_parts.append(f"Subject: {session.subject.name}")
        if session.task:
            if session.task.priority:
                desc_parts.append(f"Priority: {session.task.priority.value}")
            if session.task.description:
                desc_parts.append(f"\n{session.task.description}")
        desc_parts.append(f"Status: {session.status.value}")
        event.add("description", "\n".join(desc_parts))

        status_map = {
            SessionStatus.PLANNED: "TENTATIVE",
            SessionStatus.IN_PROGRESS: "CONFIRMED",
            SessionStatus.COMPLETED: "CONFIRMED",
            SessionStatus.PARTIAL: "CONFIRMED",
            SessionStatus.SKIPPED: "CANCELLED",
        }
        event.add("status", status_map.get(session.status, "TENTATIVE"))
        event.add("dtstamp", datetime.now(timezone.utc))
        cal.add_component(event)

    # --- constraints / blocked times ---
    for constraint in constraints:
        _add_constraint_events(cal, constraint, user)

    return cal.to_ical()


def _add_constraint_events(cal, constraint: ScheduleConstraint, user: User) -> None:
    """Add one or more iCal events for a constraint."""
    from icalendar import Event
    from zoneinfo import ZoneInfo

    type_labels = {
        "class": "Class",
        "busy": "Busy",
        "blocked": "Blocked",
        "no_study": "No Study",
    }
    label = type_labels.get(constraint.type.value if hasattr(constraint.type, "value") else str(constraint.type), "Blocked")
    summary = f"[{label}] {constraint.name}"

    try:
        user_tz = ZoneInfo(user.timezone)
    except Exception:
        user_tz = ZoneInfo("UTC")

    if constraint.is_recurring and constraint.start_time and constraint.end_time and constraint.days_of_week:
        _add_recurring_constraint(cal, constraint, summary, user_tz)
    elif constraint.start_datetime and constraint.end_datetime:
        _add_oneoff_constraint(cal, constraint, summary)


def _add_recurring_constraint(cal, constraint: ScheduleConstraint, summary: str, user_tz) -> None:
    """Add a recurring constraint as an iCal event with RRULE."""
    from icalendar import Event, vRecur

    event = Event()
    event.add("uid", f"ssc-constraint-{constraint.id}@smartstudycompanion")
    event.add("summary", summary)
    if constraint.description:
        event.add("description", constraint.description)

    # Build a DTSTART in the user's local timezone for the first applicable day
    # Use today as reference, find the next matching day
    today = datetime.now(user_tz).date()
    days = sorted(constraint.days_of_week) if constraint.days_of_week else []
    if not days:
        return

    # Find the first matching weekday from today
    first_day = None
    for offset in range(7):
        candidate = today + timedelta(days=offset)
        if candidate.weekday() in days:
            first_day = candidate
            break
    if not first_day:
        first_day = today

    start_dt = datetime.combine(first_day, constraint.start_time, tzinfo=user_tz)
    end_dt = datetime.combine(first_day, constraint.end_time, tzinfo=user_tz)

    # Handle overnight constraints (end < start means crosses midnight)
    if constraint.end_time <= constraint.start_time:
        end_dt += timedelta(days=1)

    event.add("dtstart", start_dt)
    event.add("dtend", end_dt)

    ical_days = [_ICAL_DAY_ABBR[d] for d in days if 0 <= d <= 6]
    event.add("rrule", vRecur({"FREQ": "WEEKLY", "BYDAY": ical_days}))

    event.add("dtstamp", datetime.now(timezone.utc))
    event.add("transp", "OPAQUE")
    cal.add_component(event)


def _add_oneoff_constraint(cal, constraint: ScheduleConstraint, summary: str) -> None:
    """Add a one-off constraint as a single iCal event."""
    from icalendar import Event

    event = Event()
    event.add("uid", f"ssc-constraint-{constraint.id}@smartstudycompanion")
    event.add("summary", summary)
    if constraint.description:
        event.add("description", constraint.description)

    start = constraint.start_datetime
    end = constraint.end_datetime
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)

    event.add("dtstart", start)
    event.add("dtend", end)
    event.add("dtstamp", datetime.now(timezone.utc))
    event.add("transp", "OPAQUE")
    cal.add_component(event)


def _get_calendar_data(db: Session, user: User) -> tuple[list[StudySession], list[ScheduleConstraint]]:
    """Fetch sessions and constraints for calendar export."""
    from sqlalchemy.orm import joinedload

    now = datetime.now(timezone.utc)
    window_start = (now - timedelta(days=7)).replace(tzinfo=None)
    window_end = (now + timedelta(weeks=4)).replace(tzinfo=None)

    sessions = (
        db.query(StudySession)
        .options(joinedload(StudySession.task), joinedload(StudySession.subject))
        .filter(
            StudySession.user_id == user.id,
            StudySession.start_time >= window_start,
            StudySession.start_time <= window_end,
        )
        .order_by(StudySession.start_time.asc())
        .all()
    )

    constraints = (
        db.query(ScheduleConstraint)
        .filter(ScheduleConstraint.user_id == user.id)
        .all()
    )

    return sessions, constraints


@router.get("/calendar/feed")
def calendar_feed(
    token: str = Query(..., description="Per-user calendar token"),
    db: Session = Depends(get_db),
) -> Response:
    """Public iCal feed authenticated via per-user token.

    Calendar apps (Google Calendar, Apple Calendar, Outlook) subscribe to this
    URL and poll it periodically to stay in sync.
    """
    from fastapi import HTTPException, status

    user = db.query(User).filter(User.calendar_token == token).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid calendar token",
        )

    sessions, constraints = _get_calendar_data(db, user)
    ics_bytes = _build_ics_calendar(sessions, constraints, user)

    return Response(
        content=ics_bytes,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": "attachment; filename=ssc-study-sessions.ics",
            "Cache-Control": "no-cache, no-store, must-revalidate",
        },
    )


@router.get("/calendar/download")
def calendar_download(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Response:
    """Download an .ics file of study sessions and constraints (JWT-authenticated)."""
    sessions, constraints = _get_calendar_data(db, current_user)
    ics_bytes = _build_ics_calendar(sessions, constraints, current_user)

    return Response(
        content=ics_bytes,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": "attachment; filename=ssc-study-sessions.ics",
        },
    )


@router.post("/calendar/token")
def generate_calendar_token(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> dict[str, str]:
    """Generate or regenerate a calendar subscription token."""
    current_user.calendar_token = secrets.token_urlsafe(32)
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return {"calendar_token": current_user.calendar_token}


@router.delete("/calendar/token")
def revoke_calendar_token(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> dict[str, str]:
    """Revoke the calendar subscription token."""
    current_user.calendar_token = None
    db.add(current_user)
    db.commit()
    return {"message": "Calendar token revoked"}


@router.get("/calendar/token")
def get_calendar_token(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> dict[str, str | None]:
    """Get the current calendar token (if any)."""
    return {"calendar_token": current_user.calendar_token}

