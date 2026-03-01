from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api import deps
from app.db.session import get_db
from app.models.study_session import SessionStatus, StudySession
from app.models.subject import Subject
from app.models.task import Task
from app.models.user import User
from app.schemas.analytics import (
    AnalyticsOverview,
    DashboardInsightsResponse,
    DetailedAnalytics,
    DayAdherence,
    EnergyProductivity,
    SubjectPerformance,
    StudyingNowResponse,
    TrendPoint,
)
from app.coach.factory import get_coach_adapter
from app.services import coach as coach_service
from app.schemas.session import StudySessionPublic
from app.schemas.task import TaskPublic

router = APIRouter()

# Cache for studying-now count (90s TTL to avoid DB hammering)
_studying_now_cache: dict = {"count": 0, "ts": 0.0}
STUDYING_NOW_CACHE_TTL = 90


def _session_focus(session: StudySession) -> str | None:
    if session.task and session.task.title:
        return session.task.title
    if session.subject and session.subject.name:
        return session.subject.name
    if session.notes:
        return session.notes
    return None


def _serialize_session(session: StudySession) -> StudySessionPublic:
    return StudySessionPublic(
        id=session.id,
        user_id=session.user_id,
        subject_id=session.subject_id,
        task_id=session.task_id,
        start_time=session.start_time,
        end_time=session.end_time,
        status=session.status,
        energy_level=session.energy_level,
        generated_by=session.generated_by,
        focus=_session_focus(session),
    )


def _calculate_time_distribution_for_overview(
    sessions: list[StudySession], db: Session, current_user: User
) -> dict[str, int]:
    """Calculate time distribution by subject for overview."""
    time_distribution: dict[str, int] = defaultdict(int)
    subject_lookup = {
        subject.id: subject.name
        for subject in db.query(Subject).filter(Subject.user_id == current_user.id).all()
    }
    task_to_subject: dict[int, int | None] = {
        task.id: task.subject_id
        for task in db.query(Task).filter(Task.user_id == current_user.id).all()
    }
    for session in sessions:
        duration = int((session.end_time - session.start_time).total_seconds() // 60)
        if session.subject_id and session.subject_id in subject_lookup:
            subject_name = subject_lookup[session.subject_id]
            time_distribution[subject_name] += duration
        elif session.task_id and session.task_id in task_to_subject:
            task_subject_id = task_to_subject[session.task_id]
            if task_subject_id and task_subject_id in subject_lookup:
                subject_name = subject_lookup[task_subject_id]
                time_distribution[subject_name] += duration
            else:
                time_distribution["General"] += duration
        else:
            time_distribution["General"] += duration
    return time_distribution


def _calculate_productivity_trend(sessions: list[StudySession], user_timezone: str = "UTC") -> list[TrendPoint]:
    """Calculate productivity trend for the last 7 days.
    
    Uses user's timezone to determine day boundaries for accurate daily grouping.
    """
    trend: list[TrendPoint] = []
    # Get today in user's timezone
    try:
        tz = ZoneInfo(user_timezone)
    except Exception:
        tz = ZoneInfo("UTC")
    
    now_local = datetime.now(tz)
    today_local = now_local.date()
    
    for i in range(7):
        day_cursor = today_local - timedelta(days=6 - i)
        # Get day boundaries in user's timezone, then convert to UTC for comparison
        day_start_local = datetime.combine(day_cursor, datetime.min.time()).replace(tzinfo=tz)
        day_end_local = day_start_local + timedelta(days=1)
        day_start_utc = day_start_local.astimezone(timezone.utc)
        day_end_utc = day_end_local.astimezone(timezone.utc)
        
        day_sessions = [
            session
            for session in sessions
            if day_start_utc <= _normalize_to_utc(session.start_time) < day_end_utc
        ]
        # Scheduled minutes: all sessions (including skipped)
        scheduled = sum(
            int((session.end_time - session.start_time).total_seconds() // 60)
            for session in day_sessions
        )
        # Completed minutes: only completed and partial sessions (exclude skipped)
        completed = sum(
            int((session.end_time - session.start_time).total_seconds() // 60)
            for session in day_sessions
            if session.status in (SessionStatus.COMPLETED, SessionStatus.PARTIAL)
        )
        trend.append(
            TrendPoint(
                day=day_cursor,
                completed_minutes=completed,
                scheduled_minutes=scheduled,
            )
        )
    return trend


def _calculate_streak_for_overview(sessions: list[StudySession], user_timezone: str = "UTC") -> int:
    """Calculate streak (days with 30+ minutes of completed work) for overview.
    
    Uses the user's timezone to determine day boundaries. Streaks work like standard apps:
    - You have the FULL DAY (until midnight) to complete your 30+ minutes
    - Today is checked first: if it has 30+ minutes, it's included immediately (updates in real-time)
    - If today doesn't have 30+ minutes yet, it doesn't break the streak (still in progress)
    - The streak breaks when a past day (yesterday or earlier) has < 30 minutes
    """
    streak = 0
    # Get today in user's timezone
    try:
        tz = ZoneInfo(user_timezone)
    except Exception:
        tz = ZoneInfo("UTC")
    
    now_local = datetime.now(tz)
    today_local = now_local.date()
    
    # Check today first (i=0) - if requirement is met, include it immediately
    today_start_local = datetime.combine(today_local, datetime.min.time()).replace(tzinfo=tz)
    today_end_local = today_start_local + timedelta(days=1)
    today_start_utc = today_start_local.astimezone(timezone.utc)
    today_end_utc = today_end_local.astimezone(timezone.utc)
    
    today_sessions = [
        session
        for session in sessions
        if today_start_utc <= _normalize_to_utc(session.start_time) < today_end_utc
    ]
    today_completed = sum(
        int((session.end_time - session.start_time).total_seconds() // 60)
        for session in today_sessions
        if session.status in (SessionStatus.COMPLETED, SessionStatus.PARTIAL)
    )
    
    # If today has 30+ minutes, include it in the streak (immediate update)
    if today_completed >= 30:
        streak += 1
    
    # Now check backwards from yesterday - only break on past days that don't meet requirement
    for i in range(1, 31):  # Check yesterday through 30 days ago
        day_cursor = today_local - timedelta(days=i)
        # Get day boundaries in user's timezone, then convert to UTC for comparison
        day_start_local = datetime.combine(day_cursor, datetime.min.time()).replace(tzinfo=tz)
        day_end_local = day_start_local + timedelta(days=1)
        day_start_utc = day_start_local.astimezone(timezone.utc)
        day_end_utc = day_end_local.astimezone(timezone.utc)
        
        day_sessions = [
            session
            for session in sessions
            if day_start_utc <= _normalize_to_utc(session.start_time) < day_end_utc
        ]
        # Count both completed and partial sessions toward streak
        completed = sum(
            int((session.end_time - session.start_time).total_seconds() // 60)
            for session in day_sessions
            if session.status in (SessionStatus.COMPLETED, SessionStatus.PARTIAL)
        )
        if completed >= 30:
            streak += 1
        else:
            break
    return streak


@router.get("/studying-now", response_model=StudyingNowResponse)
def get_studying_now(db: Session = Depends(get_db)) -> StudyingNowResponse:
    """Public endpoint: count of users with an active (in_progress) focus session."""
    import time

    now_ts = time.time()
    if now_ts - _studying_now_cache["ts"] < STUDYING_NOW_CACHE_TTL:
        return StudyingNowResponse(count=_studying_now_cache["count"])

    count = (
        db.query(func.count(func.distinct(StudySession.user_id)))
        .filter(StudySession.status == SessionStatus.IN_PROGRESS)
        .scalar()
        or 0
    )
    _studying_now_cache["count"] = count
    _studying_now_cache["ts"] = now_ts
    return StudyingNowResponse(count=count)


@router.get("/overview", response_model=AnalyticsOverview)
def get_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> AnalyticsOverview:
    now = datetime.now(timezone.utc)
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)

    # Fetch 7 days for adherence/trend calculations
    sessions = (
        db.query(StudySession)
        .filter(
            StudySession.user_id == current_user.id,
            StudySession.start_time >= seven_days_ago,
        )
        .all()
    )
    # Adherence: completed sessions / (total - skipped)
    # SKIPPED sessions don't count toward adherence (they're intentionally not done)
    # PARTIAL sessions also don't count as "completed" for adherence
    total_sessions = len(sessions)
    skipped_sessions = len(
        [session for session in sessions if session.status == SessionStatus.SKIPPED]
    )
    completed_sessions = len(
        [session for session in sessions if session.status == SessionStatus.COMPLETED]
    )
    # Only count non-skipped sessions in denominator
    adherence_denominator = total_sessions - skipped_sessions
    adherence = completed_sessions / adherence_denominator if adherence_denominator > 0 else 0.0

    tasks = (
        db.query(Task)
        .filter(Task.user_id == current_user.id)
        .all()
    )
    total_tasks = len(tasks)
    completed_tasks = len([task for task in tasks if task.is_completed])
    completion_rate = completed_tasks / total_tasks if total_tasks else 0.0

    time_distribution = _calculate_time_distribution_for_overview(sessions, db, current_user)
    trend = _calculate_productivity_trend(sessions, current_user.timezone)
    
    # Fetch 30 days of sessions for accurate streak calculation
    streak_sessions = (
        db.query(StudySession)
        .filter(
            StudySession.user_id == current_user.id,
            StudySession.start_time >= thirty_days_ago,
        )
        .all()
    )
    streak = _calculate_streak_for_overview(streak_sessions, current_user.timezone)
    
    # Calculate weekly hours completed (from completed and partial sessions)
    # Use calendar week: Monday 00:00:00 to now (in user's timezone)
    # This resets every Monday, making it more intuitive for students
    try:
        user_tz = ZoneInfo(current_user.timezone)
    except Exception:
        user_tz = ZoneInfo("UTC")
    
    # Get current time in user's timezone
    now_utc = datetime.now(timezone.utc)
    now_local = now_utc.astimezone(user_tz)
    today_local = now_local.date()
    
    # Calculate days to subtract to get to Monday (weekday: Monday=0, Sunday=6)
    days_since_monday = today_local.weekday()
    monday_date = today_local - timedelta(days=days_since_monday)
    
    # Get Monday 00:00:00 in user's timezone, then convert to UTC
    monday_start_local = datetime.combine(monday_date, datetime.min.time()).replace(tzinfo=user_tz)
    week_start_utc = monday_start_local.astimezone(timezone.utc)
    
    # Count sessions that ended since Monday 00:00:00 (this week)
    weekly_sessions = (
        db.query(StudySession)
        .filter(
            StudySession.user_id == current_user.id,
            StudySession.end_time >= week_start_utc,  # Count sessions that ended this week (since Monday)
            StudySession.status.in_([SessionStatus.COMPLETED, SessionStatus.PARTIAL])
        )
        .all()
    )
    weekly_completed_minutes = sum(
        int((session.end_time - session.start_time).total_seconds() // 60)
        for session in weekly_sessions
    )
    weekly_hours_completed = round(weekly_completed_minutes / 60.0, 1)

    upcoming_tasks = (
        db.query(Task)
        .filter(Task.user_id == current_user.id, Task.is_completed.is_(False))
        .order_by(Task.deadline.asc().nulls_last())
        .limit(5)
        .all()
    )
    # Get today in user's timezone for accurate "today's plan"
    try:
        user_tz = ZoneInfo(current_user.timezone)
    except Exception:
        user_tz = ZoneInfo("UTC")
    now_local = datetime.now(user_tz)
    today_local = now_local.date()
    today_start_local = datetime.combine(today_local, datetime.min.time()).replace(tzinfo=user_tz)
    today_end_local = today_start_local + timedelta(days=1)
    today_start_utc = today_start_local.astimezone(timezone.utc)
    today_end_utc = today_end_local.astimezone(timezone.utc)
    
    today_sessions = (
        db.query(StudySession)
        .filter(
            StudySession.user_id == current_user.id,
            StudySession.start_time >= today_start_utc,
            StudySession.start_time < today_end_utc,
        )
        .order_by(StudySession.start_time.asc())
        .all()
    )

    return AnalyticsOverview(
        adherence_rate=round(adherence, 2),
        completion_rate=round(completion_rate, 2),
        streak=streak,
        time_distribution=dict(time_distribution),
        productivity_trend=trend,
        upcoming_tasks=[TaskPublic.from_orm(task) for task in upcoming_tasks],
        today_plan=[_serialize_session(session) for session in today_sessions],
        weekly_hours_completed=weekly_hours_completed,
        weekly_hours_target=current_user.weekly_study_hours,
    )


def _normalize_to_utc(dt: datetime) -> datetime:
    """Normalize datetime to UTC-aware."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _calculate_adherence_metrics(
    sessions: list[StudySession], now: datetime, seven_days_ago: datetime
) -> tuple[list[StudySession], float, float]:
    """Calculate recent and previous week adherence rates.
    
    SKIPPED sessions are excluded from adherence calculations (they're intentionally not done).
    """
    recent_sessions = [
        s for s in sessions 
        if _normalize_to_utc(s.start_time) >= seven_days_ago
    ]
    # Exclude skipped sessions from denominator
    recent_non_skipped = [s for s in recent_sessions if s.status != SessionStatus.SKIPPED]
    total_recent = len(recent_non_skipped)
    completed_recent = len([s for s in recent_non_skipped if s.status == SessionStatus.COMPLETED])
    recent_adherence = completed_recent / total_recent if total_recent > 0 else 0.0
    
    fourteen_days_ago = now - timedelta(days=14)
    previous_week_sessions = [
        s for s in sessions 
        if fourteen_days_ago <= _normalize_to_utc(s.start_time) < seven_days_ago
    ]
    # Exclude skipped sessions from denominator
    prev_non_skipped = [s for s in previous_week_sessions if s.status != SessionStatus.SKIPPED]
    prev_total = len(prev_non_skipped)
    prev_completed = len([s for s in prev_non_skipped if s.status == SessionStatus.COMPLETED])
    prev_adherence = prev_completed / prev_total if prev_total > 0 else 0.0
    
    return recent_sessions, recent_adherence, prev_adherence


def _calculate_subject_time_distribution(
    sessions: list[StudySession],
    db: Session,
    current_user: User,
    tasks: list[Task],
) -> dict[str, int]:
    """Calculate time distribution by subject."""
    subject_time: dict[str, int] = defaultdict(int)
    subject_lookup = {
        subject.id: subject.name
        for subject in db.query(Subject).filter(Subject.user_id == current_user.id).all()
    }
    task_to_subject: dict[int, int | None] = {
        task.id: task.subject_id
        for task in tasks
    }
    for session in sessions:
        duration = int((session.end_time - session.start_time).total_seconds() // 60)
        if session.subject_id and session.subject_id in subject_lookup:
            subject_time[subject_lookup[session.subject_id]] += duration
        elif session.task_id and session.task_id in task_to_subject:
            task_subject_id = task_to_subject[session.task_id]
            if task_subject_id and task_subject_id in subject_lookup:
                subject_time[subject_lookup[task_subject_id]] += duration
            else:
                subject_time["General"] += duration
        else:
            subject_time["General"] += duration
    return subject_time


def _calculate_streak(sessions: list[StudySession], user_timezone: str = "UTC") -> int:
    """Calculate streak (days with 30+ minutes of completed work).
    
    Uses the user's timezone to determine day boundaries. Streaks work like standard apps:
    - You have the FULL DAY (until midnight) to complete your 30+ minutes
    - Today is checked first: if it has 30+ minutes, it's included immediately (updates in real-time)
    - If today doesn't have 30+ minutes yet, it doesn't break the streak (still in progress)
    - The streak breaks when a past day (yesterday or earlier) has < 30 minutes
    """
    streak = 0
    # Get today in user's timezone
    try:
        tz = ZoneInfo(user_timezone)
    except Exception:
        tz = ZoneInfo("UTC")
    
    now_local = datetime.now(tz)
    today_local = now_local.date()
    
    # Check today first (i=0) - if requirement is met, include it immediately
    today_start_local = datetime.combine(today_local, datetime.min.time()).replace(tzinfo=tz)
    today_end_local = today_start_local + timedelta(days=1)
    today_start_utc = today_start_local.astimezone(timezone.utc)
    today_end_utc = today_end_local.astimezone(timezone.utc)
    
    today_sessions = [
        session for session in sessions
        if today_start_utc <= _normalize_to_utc(session.start_time) < today_end_utc
    ]
    today_completed = sum(
        int((session.end_time - session.start_time).total_seconds() // 60)
        for session in today_sessions
        if session.status in (SessionStatus.COMPLETED, SessionStatus.PARTIAL)
    )
    
    # If today has 30+ minutes, include it in the streak (immediate update)
    if today_completed >= 30:
        streak += 1
    
    # Now check backwards from yesterday - only break on past days that don't meet requirement
    for i in range(1, 31):  # Check yesterday through 30 days ago
        day_cursor = today_local - timedelta(days=i)
        # Get day boundaries in user's timezone, then convert to UTC for comparison
        day_start_local = datetime.combine(day_cursor, datetime.min.time()).replace(tzinfo=tz)
        day_end_local = day_start_local + timedelta(days=1)
        day_start_utc = day_start_local.astimezone(timezone.utc)
        day_end_utc = day_end_local.astimezone(timezone.utc)
        
        day_sessions = [
            session for session in sessions
            if day_start_utc <= _normalize_to_utc(session.start_time) < day_end_utc
        ]
        # Include both completed and partial sessions in completed minutes
        completed = sum(
            int((session.end_time - session.start_time).total_seconds() // 60)
            for session in day_sessions
            if session.status in (SessionStatus.COMPLETED, SessionStatus.PARTIAL)
        )
        if completed >= 30:
            streak += 1
        else:
            break
    return streak


def _build_analytics_context(
    recent_adherence: float,
    prev_adherence: float,
    total_recent: int,
    completed_recent: int,
    streak: int,
    subject_time: dict[str, int],
    energy_by_day: dict[str, list[str]],
    tasks: list[Task],
    current_user: User,
) -> dict:
    """Build analytics context dictionary for AI."""
    return {
        "adherence_rate": recent_adherence,
        "previous_adherence": prev_adherence,
        "adherence_change": recent_adherence - prev_adherence,
        "total_sessions": total_recent,
        "completed_sessions": completed_recent,
        "streak": streak,
        "subject_time_distribution": dict(subject_time),
        "energy_patterns": dict(energy_by_day),
        "total_tasks": len(tasks),
        "completed_tasks": len([t for t in tasks if t.is_completed]),
        "upcoming_tasks_count": len([t for t in tasks if not t.is_completed]),
        "user_weekly_hours": current_user.weekly_study_hours,
    }


@router.get("/insights", response_model=DashboardInsightsResponse)
def get_dashboard_insights(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> DashboardInsightsResponse:
    """Generate AI-powered personalized insights for the dashboard."""
    from app.models.daily_energy import DailyEnergy
    
    now = datetime.now(timezone.utc)
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)
    
    sessions = (
        db.query(StudySession)
        .filter(
            StudySession.user_id == current_user.id,
            StudySession.start_time >= thirty_days_ago,
        )
        .all()
    )
    
    tasks = (
        db.query(Task)
        .filter(Task.user_id == current_user.id)
        .all()
    )
    
    # Get date range in user's timezone
    try:
        user_tz = ZoneInfo(current_user.timezone)
    except Exception:
        user_tz = ZoneInfo("UTC")
    today_local = datetime.now(user_tz).date()
    fourteen_days_ago = today_local - timedelta(days=14)
    
    energy_logs = (
        db.query(DailyEnergy)
        .filter(
            DailyEnergy.user_id == current_user.id,
            DailyEnergy.day >= fourteen_days_ago,
        )
        .all()
    )
    
    recent_sessions, recent_adherence, prev_adherence = _calculate_adherence_metrics(sessions, now, seven_days_ago)
    total_recent = len(recent_sessions)
    completed_recent = len([s for s in recent_sessions if s.status == SessionStatus.COMPLETED])
    subject_time = _calculate_subject_time_distribution(recent_sessions, db, current_user, tasks)
    
    energy_by_day: dict[str, list[str]] = defaultdict(list)
    for log in energy_logs:
        energy_by_day[log.day.isoformat()].append(log.level)
    
    streak = _calculate_streak(sessions, current_user.timezone)
    
    analytics_context = _build_analytics_context(
        recent_adherence, prev_adherence, total_recent, completed_recent,
        streak, subject_time, energy_by_day, tasks, current_user
    )
    
    adapter = get_coach_adapter()
    user_context = coach_service.build_coach_context(db, current_user)
    ai_response = adapter.generate_dashboard_insights(current_user, analytics_context, user_context)
    
    return DashboardInsightsResponse(
        insights=ai_response.get("insights", []),
        motivational_message=ai_response.get("motivational_message", "Keep up the great work!"),
        overall_tone=ai_response.get("overall_tone", "positive"),
    )


def _get_subject_name_for_session(
    session: StudySession,
    subject_lookup: dict[int, str],
    task_to_subject: dict[int, int | None],
) -> str:
    """Get subject name for a session."""
    if session.subject_id and session.subject_id in subject_lookup:
        return subject_lookup[session.subject_id]
    if session.task_id and session.task_id in task_to_subject:
        task_subject_id = task_to_subject[session.task_id]
        if task_subject_id and task_subject_id in subject_lookup:
            return subject_lookup[task_subject_id]
    return "General"


def _calculate_subject_performance(
    all_sessions: list[StudySession],
    all_tasks: list[Task],
    subject_lookup: dict[int, str],
    task_to_subject: dict[int, int | None],
) -> list[SubjectPerformance]:
    """Calculate subject performance metrics."""
    subject_perf: dict[str, dict] = defaultdict(lambda: {
        "time_minutes": 0,
        "tasks_total": 0,
        "tasks_completed": 0,
        "sessions_total": 0,
        "sessions_completed": 0,
    })
    
    for session in all_sessions:
        duration = int((session.end_time - session.start_time).total_seconds() // 60)
        subject_name = _get_subject_name_for_session(session, subject_lookup, task_to_subject)
        subject_perf[subject_name]["time_minutes"] += duration
        subject_perf[subject_name]["sessions_total"] += 1
        if session.status == SessionStatus.COMPLETED:
            subject_perf[subject_name]["sessions_completed"] += 1
    
    for task in all_tasks:
        subject_name = subject_lookup.get(task.subject_id, "General") if task.subject_id else "General"
        subject_perf[subject_name]["tasks_total"] += 1
        if task.is_completed:
            subject_perf[subject_name]["tasks_completed"] += 1
    
    subject_performance_list = []
    for subject_name, data in subject_perf.items():
        completion_rate = data["tasks_completed"] / data["tasks_total"] if data["tasks_total"] > 0 else 0.0
        adherence_rate = data["sessions_completed"] / data["sessions_total"] if data["sessions_total"] > 0 else 0.0
        subject_performance_list.append(
            SubjectPerformance(
                subject_name=subject_name,
                time_spent_minutes=data["time_minutes"],
                tasks_total=data["tasks_total"],
                tasks_completed=data["tasks_completed"],
                completion_rate=round(completion_rate, 2),
                sessions_total=data["sessions_total"],
                sessions_completed=data["sessions_completed"],
                adherence_rate=round(adherence_rate, 2),
            )
        )
    subject_performance_list.sort(key=lambda x: x.time_spent_minutes, reverse=True)
    return subject_performance_list


def _calculate_energy_productivity(all_sessions: list[StudySession]) -> list[EnergyProductivity]:
    """Calculate energy-productivity correlation."""
    energy_stats: dict[str, dict] = defaultdict(lambda: {"total": 0, "completed": 0, "duration_sum": 0})
    for session in all_sessions:
        energy = session.energy_level or "medium"
        duration = int((session.end_time - session.start_time).total_seconds() // 60)
        energy_stats[energy]["total"] += 1
        energy_stats[energy]["duration_sum"] += duration
        if session.status == SessionStatus.COMPLETED:
            energy_stats[energy]["completed"] += 1
    
    energy_productivity_list = []
    for energy_level in ["low", "medium", "high"]:
        if energy_level in energy_stats:
            stats = energy_stats[energy_level]
            completion_rate = stats["completed"] / stats["total"] if stats["total"] > 0 else 0.0
            avg_duration = stats["duration_sum"] / stats["total"] if stats["total"] > 0 else 0.0
            energy_productivity_list.append(
                EnergyProductivity(
                    energy_level=energy_level,
                    sessions_count=stats["total"],
                    completed_count=stats["completed"],
                    completion_rate=round(completion_rate, 2),
                    average_duration_minutes=round(avg_duration, 1),
                )
            )
        else:
            energy_productivity_list.append(
                EnergyProductivity(
                    energy_level=energy_level,
                    sessions_count=0,
                    completed_count=0,
                    completion_rate=0.0,
                    average_duration_minutes=0.0,
                )
            )
    return energy_productivity_list


def _calculate_day_adherence(all_sessions: list[StudySession], user_timezone: str = "UTC") -> list[DayAdherence]:
    """Calculate day adherence (day of week).
    
    Uses user's timezone to determine which day of week each session belongs to.
    SKIPPED sessions are excluded from adherence calculations.
    """
    # Get timezone for day-of-week calculation
    try:
        tz = ZoneInfo(user_timezone)
    except Exception:
        tz = ZoneInfo("UTC")
    
    day_stats: dict[str, dict] = defaultdict(lambda: {"scheduled": 0, "completed": 0})
    for session in all_sessions:
        # Convert to user's timezone to get correct day of week
        session_utc = _normalize_to_utc(session.start_time)
        session_local = session_utc.astimezone(tz)
        day_name = session_local.strftime("%A")
        # Only count non-skipped sessions for adherence
        if session.status != SessionStatus.SKIPPED:
            day_stats[day_name]["scheduled"] += 1
            if session.status == SessionStatus.COMPLETED:
                day_stats[day_name]["completed"] += 1
    
    day_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    day_adherence_list = []
    for day_name in day_order:
        if day_name in day_stats:
            stats = day_stats[day_name]
            adherence = stats["completed"] / stats["scheduled"] if stats["scheduled"] > 0 else 0.0
            day_adherence_list.append(
                DayAdherence(
                    day_name=day_name,
                    sessions_scheduled=stats["scheduled"],
                    sessions_completed=stats["completed"],
                    adherence_rate=round(adherence, 2),
                )
            )
    return day_adherence_list


def _calculate_productivity_trend_for_range(
    all_sessions: list[StudySession], start_date: date, end_date: date, user_timezone: str = "UTC"
) -> list[TrendPoint]:
    """Calculate productivity trend for the date range.
    
    Uses user's timezone to determine day boundaries for accurate daily grouping.
    """
    try:
        tz = ZoneInfo(user_timezone)
    except Exception:
        tz = ZoneInfo("UTC")
    
    trend = []
    current_date = start_date
    while current_date <= end_date:
        # Get day boundaries in user's timezone, then convert to UTC
        day_start_local = datetime.combine(current_date, datetime.min.time()).replace(tzinfo=tz)
        day_end_local = day_start_local + timedelta(days=1)
        day_start_utc = day_start_local.astimezone(timezone.utc)
        day_end_utc = day_end_local.astimezone(timezone.utc)
        
        day_sessions = [
            s for s in all_sessions
            if day_start_utc <= _normalize_to_utc(s.start_time) < day_end_utc
        ]
        # Scheduled: all sessions
        scheduled = sum(
            int((s.end_time - s.start_time).total_seconds() // 60)
            for s in day_sessions
        )
        # Completed: only completed and partial sessions
        completed = sum(
            int((s.end_time - s.start_time).total_seconds() // 60)
            for s in day_sessions
            if s.status in (SessionStatus.COMPLETED, SessionStatus.PARTIAL)
        )
        trend.append(
            TrendPoint(
                day=current_date,
                completed_minutes=completed,
                scheduled_minutes=scheduled,
            )
        )
        current_date += timedelta(days=1)
    return trend


@router.get("/detailed", response_model=DetailedAnalytics)
def get_detailed_analytics(
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> DetailedAnalytics:
    """
    Get detailed analytics with subject performance, energy correlation, and day adherence.
    
    - start_date: Start of time range (defaults to 7 days ago)
    - end_date: End of time range (defaults to today)
    """
    # Default to user's timezone for date range
    try:
        user_tz = ZoneInfo(current_user.timezone)
    except Exception:
        user_tz = ZoneInfo("UTC")
    
    if end_date is None:
        end_date = datetime.now(user_tz).date()
    if start_date is None:
        start_date = end_date - timedelta(days=7)
    
    start_datetime = datetime.combine(start_date, datetime.min.time()).replace(tzinfo=timezone.utc)
    end_datetime = datetime.combine(end_date, datetime.max.time()).replace(tzinfo=timezone.utc)
    
    all_sessions = (
        db.query(StudySession)
        .filter(
            StudySession.user_id == current_user.id,
            StudySession.start_time >= start_datetime,
            StudySession.start_time <= end_datetime,
        )
        .all()
    )
    
    all_tasks = db.query(Task).filter(Task.user_id == current_user.id).all()
    subjects = db.query(Subject).filter(Subject.user_id == current_user.id).all()
    subject_lookup = {s.id: s.name for s in subjects}
    task_to_subject: dict[int, int | None] = {task.id: task.subject_id for task in all_tasks}
    
    subject_performance_list = _calculate_subject_performance(
        all_sessions, all_tasks, subject_lookup, task_to_subject
    )
    energy_productivity_list = _calculate_energy_productivity(all_sessions)
    day_adherence_list = _calculate_day_adherence(all_sessions, current_user.timezone)
    trend = _calculate_productivity_trend_for_range(all_sessions, start_date, end_date, current_user.timezone)
    time_distribution = _calculate_time_distribution_for_overview(all_sessions, db, current_user)
    
    # Overall adherence: exclude SKIPPED sessions from denominator
    non_skipped_sessions = [s for s in all_sessions if s.status != SessionStatus.SKIPPED]
    total_sessions = len(non_skipped_sessions)
    completed_sessions = len([s for s in non_skipped_sessions if s.status == SessionStatus.COMPLETED])
    overall_adherence = completed_sessions / total_sessions if total_sessions > 0 else 0.0
    total_time = sum(
        int((s.end_time - s.start_time).total_seconds() // 60)
        for s in all_sessions
    )
    
    return DetailedAnalytics(
        time_range_start=start_date,
        time_range_end=end_date,
        total_sessions=total_sessions,
        completed_sessions=completed_sessions,
        overall_adherence=round(overall_adherence, 2),
        total_time_minutes=total_time,
        subject_performance=subject_performance_list,
        energy_productivity=energy_productivity_list,
        day_adherence=day_adherence_list,
        productivity_trend=trend,
        time_distribution=dict(time_distribution),
    )


# ---------------------------------------------------------------------------
# Weekly Recap
# ---------------------------------------------------------------------------

def _get_week_boundaries(user_tz_str: str) -> tuple[datetime, datetime, datetime, datetime]:
    """Get current and previous week boundaries in UTC (naive)."""
    try:
        user_tz = ZoneInfo(user_tz_str)
    except Exception:
        user_tz = ZoneInfo("UTC")

    now_local = datetime.now(user_tz)
    # Start of this week (Monday 00:00)
    days_since_monday = now_local.weekday()
    this_monday = (now_local - timedelta(days=days_since_monday)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    last_monday = this_monday - timedelta(weeks=1)
    last_sunday = this_monday

    # Convert to naive UTC
    this_monday_utc = this_monday.astimezone(timezone.utc).replace(tzinfo=None)
    last_monday_utc = last_monday.astimezone(timezone.utc).replace(tzinfo=None)
    last_sunday_utc = last_sunday.astimezone(timezone.utc).replace(tzinfo=None)
    # Previous week for comparison
    prev_monday_utc = (last_monday - timedelta(weeks=1)).astimezone(timezone.utc).replace(tzinfo=None)

    return last_monday_utc, last_sunday_utc, prev_monday_utc, this_monday_utc


def _session_duration_minutes(s: StudySession) -> int:
    return int((s.end_time - s.start_time).total_seconds() // 60)


def _classify_time_of_day(hour: int) -> str:
    if 5 <= hour < 12:
        return "morning"
    if 12 <= hour < 17:
        return "afternoon"
    if 17 <= hour < 21:
        return "evening"
    return "night"


_ACTIVE_STATUSES = (SessionStatus.COMPLETED, SessionStatus.PARTIAL)


def _compute_session_counts(
    sessions: list[StudySession],
) -> tuple[int, int, int, int, int]:
    total = len(sessions)
    completed = len([s for s in sessions if s.status == SessionStatus.COMPLETED])
    skipped = len([s for s in sessions if s.status == SessionStatus.SKIPPED])
    partial = len([s for s in sessions if s.status == SessionStatus.PARTIAL])
    total_minutes = sum(
        _session_duration_minutes(s)
        for s in sessions
        if s.status in _ACTIVE_STATUSES
    )
    return total, completed, skipped, partial, total_minutes


def _compute_adherence(
    total: int,
    completed: int,
    prev_sessions: list[StudySession],
) -> tuple[float, float]:
    adherence = (completed / total * 100) if total > 0 else 0
    prev_non_skipped = [s for s in prev_sessions if s.status != SessionStatus.SKIPPED]
    prev_completed = len([s for s in prev_sessions if s.status == SessionStatus.COMPLETED])
    prev_adherence = (prev_completed / len(prev_non_skipped) * 100) if prev_non_skipped else 0
    return adherence, prev_adherence


def _session_subject_name(s: StudySession) -> str:
    if s.subject:
        return s.subject.name
    if s.task:
        return s.task.title
    return "Other"


def _compute_subject_minutes(sessions: list[StudySession]) -> dict[str, int]:
    subject_minutes: dict[str, int] = defaultdict(int)
    for s in sessions:
        if s.status not in _ACTIVE_STATUSES:
            continue
        subject_minutes[_session_subject_name(s)] += _session_duration_minutes(s)
    return dict(subject_minutes)


def _find_worst_day(day_details: dict[str, dict]) -> str:
    if not day_details:
        return ""
    days_with_skips = {
        d: info["skipped"] for d, info in day_details.items() if info["skipped"] > 0
    }
    if not days_with_skips:
        return ""
    return max(days_with_skips, key=days_with_skips.get)


def _compute_day_breakdown(
    sessions: list[StudySession], user_tz: ZoneInfo,
) -> tuple[dict[str, dict], str, str]:
    day_details: dict[str, dict] = {}
    day_totals: dict[str, int] = defaultdict(int)
    for s in sessions:
        local_start = s.start_time.replace(tzinfo=timezone.utc).astimezone(user_tz)
        day_name = local_start.strftime("%A")
        if day_name not in day_details:
            day_details[day_name] = {"completed": 0, "skipped": 0, "minutes": 0}
        if s.status == SessionStatus.COMPLETED:
            day_details[day_name]["completed"] += 1
            mins = _session_duration_minutes(s)
            day_details[day_name]["minutes"] += mins
            day_totals[day_name] += mins
        elif s.status == SessionStatus.SKIPPED:
            day_details[day_name]["skipped"] += 1

    best_day = max(day_totals, key=day_totals.get, default="") if day_totals else ""
    worst_day = _find_worst_day(day_details)
    return day_details, best_day, worst_day


def _compute_best_time_of_day(
    sessions: list[StudySession], user_tz: ZoneInfo,
) -> str:
    time_of_day_minutes: dict[str, int] = defaultdict(int)
    for s in sessions:
        if s.status not in _ACTIVE_STATUSES:
            continue
        local_start = s.start_time.replace(tzinfo=timezone.utc).astimezone(user_tz)
        period = _classify_time_of_day(local_start.hour)
        time_of_day_minutes[period] += _session_duration_minutes(s)
    if not time_of_day_minutes:
        return ""
    return max(time_of_day_minutes, key=time_of_day_minutes.get)


def _collect_skipped_details(
    sessions: list[StudySession], user_tz: ZoneInfo,
) -> list[dict]:
    details = []
    for s in sessions:
        if s.status != SessionStatus.SKIPPED:
            continue
        local_start = s.start_time.replace(tzinfo=timezone.utc).astimezone(user_tz)
        details.append({
            "focus": _session_focus(s) or "Study session",
            "day": local_start.strftime("%A"),
            "time": local_start.strftime("%I:%M %p"),
        })
    return details


def _compute_task_stats(
    db: Session, user_id: int, last_mon: datetime, last_sun: datetime,
) -> tuple[int, int]:
    tasks = db.query(Task).filter(Task.user_id == user_id).all()
    now_utc_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    completed = sum(
        1 for t in tasks
        if t.is_completed and t.completed_at
        and last_mon <= t.completed_at < last_sun
    )
    overdue = sum(
        1 for t in tasks
        if not t.is_completed and t.deadline and t.deadline < now_utc_naive
    )
    return completed, overdue


def _build_weekly_recap_context(
    db: Session, current_user: User
) -> dict:
    """Gather all data needed for the weekly recap AI prompt."""
    from sqlalchemy.orm import joinedload

    last_mon, last_sun, prev_mon, _ = _get_week_boundaries(current_user.timezone)

    try:
        user_tz = ZoneInfo(current_user.timezone)
    except Exception:
        user_tz = ZoneInfo("UTC")

    sessions = (
        db.query(StudySession)
        .options(joinedload(StudySession.task), joinedload(StudySession.subject))
        .filter(
            StudySession.user_id == current_user.id,
            StudySession.start_time >= last_mon,
            StudySession.start_time < last_sun,
        )
        .order_by(StudySession.start_time.asc())
        .all()
    )

    prev_sessions = (
        db.query(StudySession)
        .filter(
            StudySession.user_id == current_user.id,
            StudySession.start_time >= prev_mon,
            StudySession.start_time < last_mon,
        )
        .all()
    )

    total, completed, skipped, partial, total_minutes = _compute_session_counts(sessions)
    adherence, prev_adherence = _compute_adherence(total, completed, prev_sessions)
    day_details, best_day, worst_day = _compute_day_breakdown(sessions, user_tz)
    best_time = _compute_best_time_of_day(sessions, user_tz)
    tasks_completed, tasks_overdue = _compute_task_stats(db, current_user.id, last_mon, last_sun)

    thirty_days_ago = last_mon - timedelta(days=30)
    streak_sessions = (
        db.query(StudySession)
        .filter(
            StudySession.user_id == current_user.id,
            StudySession.start_time >= thirty_days_ago,
        )
        .all()
    )

    return {
        "total_sessions": total,
        "completed_sessions": completed,
        "skipped_sessions": skipped,
        "partial_sessions": partial,
        "total_hours": total_minutes / 60,
        "target_hours": current_user.weekly_study_hours,
        "adherence_rate": adherence,
        "prev_adherence_rate": prev_adherence,
        "best_day": best_day,
        "worst_day": worst_day,
        "best_time_of_day": best_time,
        "subjects_breakdown": _compute_subject_minutes(sessions),
        "tasks_completed": tasks_completed,
        "tasks_overdue": tasks_overdue,
        "streak": _calculate_streak(streak_sessions, current_user.timezone),
        "day_details": day_details,
        "skipped_sessions_detail": _collect_skipped_details(sessions, user_tz),
        "week_start": last_mon.isoformat(),
        "week_end": last_sun.isoformat(),
    }


@router.get("/weekly-recap")
def get_weekly_recap(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> dict:
    """Generate AI-powered weekly recap for the previous week."""
    weekly_context = _build_weekly_recap_context(db, current_user)

    # If no sessions at all last week, return a simple message
    if weekly_context["total_sessions"] == 0:
        return {
            "has_data": False,
            "recap": None,
            "week_start": weekly_context["week_start"],
            "week_end": weekly_context["week_end"],
        }

    try:
        adapter = get_coach_adapter()
        user_context = coach_service.build_coach_context(db, current_user)
        ai_recap = adapter.generate_weekly_recap(current_user, weekly_context, user_context)
    except Exception:
        from app.coach.openai_adapter import _weekly_recap_fallback
        ai_recap = _weekly_recap_fallback(weekly_context)

    return {
        "has_data": True,
        "recap": ai_recap.get("recap", ""),
        "highlight": ai_recap.get("highlight", ""),
        "concern": ai_recap.get("concern"),
        "actions": ai_recap.get("actions", []),
        "tone": ai_recap.get("tone", "encouraging"),
        "stats": {
            "sessions_completed": weekly_context["completed_sessions"],
            "sessions_total": weekly_context["total_sessions"],
            "hours_studied": round(weekly_context["total_hours"], 1),
            "hours_target": weekly_context["target_hours"],
            "adherence": round(weekly_context["adherence_rate"]),
            "tasks_completed": weekly_context["tasks_completed"],
            "streak": weekly_context["streak"],
        },
        "week_start": weekly_context["week_start"],
        "week_end": weekly_context["week_end"],
    }

