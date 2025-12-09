from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
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
    TrendPoint,
)
from app.coach.factory import get_coach_adapter
from app.services import coach as coach_service
from app.schemas.session import StudySessionPublic
from app.schemas.task import TaskPublic

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
    # Partial sessions count toward hours/streak but not adherence
    weekly_completed_minutes = sum(
        int((session.end_time - session.start_time).total_seconds() // 60)
        for session in sessions
        if session.status in (SessionStatus.COMPLETED, SessionStatus.PARTIAL)
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
    day_adherence_list = _calculate_day_adherence(all_sessions)
    trend = _calculate_productivity_trend_for_range(all_sessions, start_date, end_date)
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

