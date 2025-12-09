from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Iterable, Literal, Sequence
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models.constraint import ConstraintType, ScheduleConstraint
from app.models.daily_energy import DailyEnergy, EnergyLevel
from app.models.subject import Subject, SubjectDifficulty
from app.models.task import Task, TaskPriority
from app.models.user import User
from app.schemas.schedule import DailyPlan, StudyBlock, WeeklyPlan

WINDOW_SCHEDULE = {
    "morning": (time(hour=7), time(hour=11)),
    "afternoon": (time(hour=12), time(hour=16, minute=30)),
    "evening": (time(hour=17), time(hour=21)),
    "night": (time(hour=21), time(hour=23)),
}


def _parse_custom_time(time_str: str) -> time | None:
    """Parse time string in HH:MM format to time object."""
    try:
        parts = time_str.split(":")
        if len(parts) != 2:
            return None
        return time(hour=int(parts[0]), minute=int(parts[1]))
    except (ValueError, IndexError, AttributeError):
        return None


def _parse_custom_range(value: any) -> tuple[time, time] | None:
    """Parse custom time range from dict or Pydantic model."""
    if isinstance(value, dict):
        start_str = value.get("start")
        end_str = value.get("end")
        if not (start_str and end_str):
            return None
        start_time = _parse_custom_time(start_str)
        end_time = _parse_custom_time(end_str)
        if start_time and end_time:
            return (start_time, end_time)
    else:
        # Pydantic CustomTimeRange object
        try:
            return value.to_time_tuple()
        except (AttributeError, ValueError):
            pass
    return None


def _parse_window_config(window_config: any) -> tuple[time, time] | None:
    """Parse a single window configuration (preset or custom)."""
    if isinstance(window_config, dict):
        window_type = window_config.get("type")
        value = window_config.get("value")
    else:
        window_type = getattr(window_config, "type", None)
        value = getattr(window_config, "value", None)
    
    if window_type == "preset" and isinstance(value, str):
        return WINDOW_SCHEDULE.get(value)
    elif window_type == "custom":
        return _parse_custom_range(value)
    return None


def _parse_study_windows(preferred_windows_raw: any) -> list[tuple[time, time]]:
    """
    Parse preferred study windows from various formats (backward compatible).
    
    Supports:
    - Old format: ["morning", "evening"] (list of strings)
    - New format: [{"type": "preset", "value": "morning"}, {"type": "custom", "value": {"start": "08:00", "end": "10:30"}}]
    
    Returns list of (start_time, end_time) tuples.
    """
    default = [(WINDOW_SCHEDULE["evening"][0], WINDOW_SCHEDULE["evening"][1])]
    
    if not preferred_windows_raw:
        return default
    
    if not isinstance(preferred_windows_raw, list) or len(preferred_windows_raw) == 0:
        return default
    
    # Handle old format: list of strings
    if isinstance(preferred_windows_raw[0], str):
        windows = [WINDOW_SCHEDULE[name] for name in preferred_windows_raw if name in WINDOW_SCHEDULE]
        return windows if windows else default
    
    # New format: list of config objects/dicts
    windows = []
    for window_config in preferred_windows_raw:
        parsed = _parse_window_config(window_config)
        if parsed:
            windows.append(parsed)
    
    return windows if windows else default

PRIORITY_WEIGHT = {
    TaskPriority.LOW: 0.8,
    TaskPriority.MEDIUM: 1.0,
    TaskPriority.HIGH: 1.3,
    TaskPriority.CRITICAL: 1.6,
}

DIFFICULTY_WEIGHT = {
    SubjectDifficulty.EASY: 0.9,
    SubjectDifficulty.MEDIUM: 1.0,
    SubjectDifficulty.HARD: 1.25,
}

ENERGY_SESSION_CAP = {
    EnergyLevel.LOW: 45,
    EnergyLevel.MEDIUM: 90,
    EnergyLevel.HIGH: 120,
}


@dataclass(order=True)
class WeightedTask:
    sort_index: float = field(init=False, repr=False, compare=True)
    weight: float = field(compare=False)
    task: Task = field(compare=False)
    subject: Subject | None = field(compare=False)
    remaining_minutes: int = field(compare=False)

    def __post_init__(self) -> None:
        self.sort_index = -self.weight  # invert for descending sort


def _calculate_subject_weight_modifier(subject: Subject, reference: datetime) -> float:
    """Calculate weight modifier based on subject difficulty and exam urgency."""
    modifier = DIFFICULTY_WEIGHT[subject.difficulty]
    
    if subject.exam_date:
        days_until_exam = (subject.exam_date - reference.date()).days
        if days_until_exam >= 0:
            exam_urgency = max(0, 30 - days_until_exam) / 30
            modifier *= 1 + exam_urgency * 0.5
    
    return modifier


def _calculate_deadline_weight_modifier(task: Task, reference: datetime) -> float:
    """Calculate weight modifier based on task deadline.
    If deadline is None, treat as the lowest urgency (returns lowest modifier).
    """
    deadline = task.deadline
    ref = reference

    if not deadline:
        # No deadline, so treat as lowest urgency
        return 1.0

    # Make both UTC-aware (assume naive values are UTC)
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    if ref and ref.tzinfo is None:
        ref = ref.replace(tzinfo=timezone.utc)

    delta_days = (deadline - ref).total_seconds() / 86400
    if delta_days <= 0:
        return 1.75
    deadline_pressure = max(0, 7 - delta_days) / 7
    return 1 + deadline_pressure


def calculate_weights(
    tasks: Sequence[Task], subjects: Sequence[Subject], reference: datetime
) -> list[WeightedTask]:
    subject_map = {subject.id: subject for subject in subjects}
    weighted_tasks: list[WeightedTask] = []

    for task in tasks:
        # Skip completed tasks
        if task.is_completed:
            continue
        
        # Skip recurring templates (only instances should be scheduled)
        if task.is_recurring_template:
            continue
        
        subject = subject_map.get(task.subject_id)
        weight = PRIORITY_WEIGHT[task.priority]
        
        if subject:
            weight *= _calculate_subject_weight_modifier(subject, reference)
        
        weight *= _calculate_deadline_weight_modifier(task, reference)
        weight += task.estimated_minutes / 120
        
        # Calculate remaining work: estimated - total time spent (session + timer)
        total_spent = task.total_minutes_spent
        remaining_minutes = max(0, task.estimated_minutes - total_spent)
        
        # Skip tasks with no remaining work
        if remaining_minutes <= 0:
            continue
        
        weighted_tasks.append(
            WeightedTask(
                weight=weight,
                task=task,
                subject=subject,
                remaining_minutes=remaining_minutes,
            )
        )

    weighted_tasks.sort()
    return weighted_tasks


def _local_day_start(reference: datetime, tz_str: str) -> datetime:
    """
    Get start of day in user's timezone, returned as naive UTC datetime.
    
    This returns the UTC datetime that corresponds to midnight in the user's timezone
    for the day that contains the reference time.
    """
    tz = ZoneInfo(tz_str)
    # Convert reference to user's timezone
    if reference.tzinfo is None:
        reference = reference.replace(tzinfo=timezone.utc)
    localized = reference.astimezone(tz)
    # Get midnight in user's timezone
    day_start_local = localized.replace(hour=0, minute=0, second=0, microsecond=0)
    # Convert back to UTC and return as naive (for database storage)
    return day_start_local.astimezone(timezone.utc).replace(tzinfo=None)


def _window_to_range(day_start: datetime, block: tuple[time, time], user_tz: str) -> tuple[datetime, datetime]:
    """
    Convert time block to datetime range in user's timezone, then to UTC.
    
    Args:
        day_start: Start of day (naive UTC datetime representing midnight in user's tz)
        block: Tuple of (start_time, end_time) as time objects
        user_tz: User's timezone string (e.g., "Asia/Singapore")
    
    Returns:
        Tuple of (start_datetime, end_datetime) as naive UTC datetimes
    """
    tz = ZoneInfo(user_tz)
    # day_start is naive but represents midnight UTC that corresponds to midnight in user's tz
    # We need to reconstruct the local midnight, then apply the time block, then convert to UTC
    # Convert day_start (naive UTC) to aware UTC, then to user's timezone
    day_start_utc = day_start.replace(tzinfo=timezone.utc)
    day_start_local = day_start_utc.astimezone(tz)
    
    # Apply time block in user's local timezone
    start_local = day_start_local.replace(hour=block[0].hour, minute=block[0].minute, second=0, microsecond=0)
    end_local = day_start_local.replace(hour=block[1].hour, minute=block[1].minute, second=0, microsecond=0)
    
    if end_local <= start_local:
        end_local += timedelta(days=1)
    
    # Convert back to UTC (naive for storage)
    start_utc = start_local.astimezone(timezone.utc).replace(tzinfo=None)
    end_utc = end_local.astimezone(timezone.utc).replace(tzinfo=None)
    
    return start_utc, end_utc


def _is_recurring_constraint_relevant(constraint: ScheduleConstraint, weekday: int) -> bool:
    """Check if a recurring constraint applies to the given weekday."""
    return constraint.days_of_week and weekday in constraint.days_of_week


def _is_one_time_constraint_relevant(constraint: ScheduleConstraint, day: date) -> bool:
    """Check if a one-time constraint applies to the given day."""
    if not constraint.start_datetime:
        return False
    if constraint.start_datetime.date() > day:
        return False
    if not constraint.end_datetime:
        return False
    return constraint.end_datetime.date() >= day


def _extract_constraints_for_day(
    constraints: Iterable[ScheduleConstraint], day: date
) -> list[ScheduleConstraint]:
    weekday = day.weekday()
    relevant: list[ScheduleConstraint] = []
    for constraint in constraints:
        if constraint.is_recurring:
            if _is_recurring_constraint_relevant(constraint, weekday):
                relevant.append(constraint)
        else:
            if _is_one_time_constraint_relevant(constraint, day):
                relevant.append(constraint)
    return relevant


def apply_constraints(
    blocks: list[tuple[datetime, datetime]], constraints: list[ScheduleConstraint]
) -> list[tuple[datetime, datetime]]:
    if not constraints:
        return blocks

    def overlaps(
        block_start: datetime,
        block_end: datetime,
        constraint: ScheduleConstraint,
    ) -> bool:
        if constraint.start_datetime and constraint.end_datetime:
            return not (block_end <= constraint.start_datetime or block_start >= constraint.end_datetime)
        if constraint.start_time and constraint.end_time:
            c_start = block_start.replace(
                hour=constraint.start_time.hour, minute=constraint.start_time.minute
            )
            c_end = block_start.replace(
                hour=constraint.end_time.hour, minute=constraint.end_time.minute
            )
            if c_end <= c_start:
                c_end += timedelta(days=1)
            return not (block_end <= c_start or block_start >= c_end)
        return False

    filtered: list[tuple[datetime, datetime]] = []
    for block_start, block_end in blocks:
        conflict = any(overlaps(block_start, block_end, constraint) for constraint in constraints)
        if not conflict:
            filtered.append((block_start, block_end))
    return filtered


def insert_breaks(
    sessions: list[StudyBlock], break_minutes: int
) -> list[StudyBlock]:
    if not sessions:
        return sessions
    adjusted: list[StudyBlock] = []
    for idx, session in enumerate(sessions):
        adjusted.append(session)
        if idx < len(sessions) - 1:
            gap = sessions[idx + 1].start_time - session.end_time
            required_gap = timedelta(minutes=break_minutes)
            if gap < required_gap:
                shift = required_gap - gap
                sessions[idx + 1].start_time += shift
                sessions[idx + 1].end_time += shift
    return adjusted


def interleave_subjects(sessions: list[StudyBlock]) -> list[StudyBlock]:
    if not sessions:
        return sessions

    reordered: list[StudyBlock] = [sessions[0]]
    remaining = sessions[1:]
    while remaining:
        last_subject = reordered[-1].subject_id
        next_idx = None
        for idx, candidate in enumerate(remaining):
            if candidate.subject_id != last_subject:
                next_idx = idx
                break
        if next_idx is None:
            next_idx = 0
        reordered.append(remaining.pop(next_idx))
    return reordered


def _energy_cap(level: EnergyLevel | None, user_max: int) -> int:
    cap = ENERGY_SESSION_CAP.get(level or EnergyLevel.MEDIUM, user_max)
    return min(cap, user_max)


def _process_task_in_window(
    tasks: list[WeightedTask],
    pointer: datetime,
    window_end: datetime,
    session_cap: timedelta,
    break_duration: timedelta,
    energy_level: EnergyLevel | None,
) -> tuple[StudyBlock | None, datetime]:
    """Process a single task within a time window and return the created session and updated pointer."""
    if not tasks or pointer >= window_end:
        return None, pointer
    
    current_task = tasks[0]
    session_length = min(
        session_cap,
        timedelta(minutes=current_task.remaining_minutes),
        window_end - pointer,
    )
    
    if session_length <= timedelta(minutes=10):
        tasks.pop(0)
        return None, pointer
    
    session = StudyBlock(
        start_time=pointer,
        end_time=pointer + session_length,
        subject_id=current_task.subject.id if current_task.subject else None,
        task_id=current_task.task.id,
        focus=current_task.task.title,
        energy_level=energy_level.value if energy_level else None,
        generated_by="weekly",
    )
    
    new_pointer = pointer + session_length + break_duration
    current_task.remaining_minutes -= int(session_length.total_seconds() // 60)
    
    if current_task.remaining_minutes <= 0:
        tasks.pop(0)
    else:
        tasks.sort()
    
    return session, new_pointer


def _normalize_current_time(current_time: datetime | None) -> datetime | None:
    """Normalize current_time to UTC-aware datetime."""
    if not current_time:
        return None
    if current_time.tzinfo is None:
        return current_time.replace(tzinfo=timezone.utc)
    return current_time.astimezone(timezone.utc)


def _calculate_window_pointer(
    window_start: datetime, window_end: datetime, current_time: datetime | None
) -> datetime | None:
    """Calculate the starting pointer for a window, accounting for current time if window is today."""
    pointer = window_start
    if not current_time:
        return pointer
    
    window_start_aware = window_start.replace(tzinfo=timezone.utc) if window_start.tzinfo is None else window_start.astimezone(timezone.utc)
    window_date = window_start_aware.date()
    current_date = current_time.date()
    
    if window_date == current_date:
        current_time_naive = current_time.replace(tzinfo=None) if current_time.tzinfo else current_time
        pointer = max(window_start, current_time_naive)
    
    if pointer >= window_end:
        return None
    return pointer


def _allocate_sessions_for_day(
    windows: list[tuple[datetime, datetime]],
    tasks: list[WeightedTask],
    energy_level: EnergyLevel | None,
    user: User,
    current_time: datetime | None = None,
) -> list[StudyBlock]:
    """
    Allocate study sessions within available time windows.
    
    Args:
        windows: List of (start, end) datetime tuples for available time blocks
        tasks: List of weighted tasks to schedule
        energy_level: User's energy level for the day
        user: User object with preferences
        current_time: Current datetime (UTC). If provided and window is today, 
                     sessions won't be scheduled in the past.
    """
    sessions: list[StudyBlock] = []
    break_duration = timedelta(minutes=user.break_duration)
    session_cap = timedelta(minutes=_energy_cap(energy_level, user.max_session_length))
    current_time = _normalize_current_time(current_time)

    for window_start, window_end in windows:
        pointer = _calculate_window_pointer(window_start, window_end, current_time)
        if pointer is None:
            continue
            
        while pointer < window_end and tasks:
            session, pointer = _process_task_in_window(
                tasks, pointer, window_end, session_cap, break_duration, energy_level
            )
            if session:
                sessions.append(session)
    
    return interleave_subjects(insert_breaks(sessions, user.break_duration))


def build_weekly_plan(
    user: User,
    tasks: list[WeightedTask],
    constraints: Iterable[ScheduleConstraint],
    energy_by_day: dict[date, EnergyLevel],
    reference: datetime,
) -> WeeklyPlan:
    week_start = _local_day_start(reference, user.timezone)
    plans: list[DailyPlan] = []
    for offset in range(7):
        day_start = week_start + timedelta(days=offset)
        day_date = day_start.date()
        energy_level = energy_by_day.get(day_date)
        
        # Parse preferred study windows (supports both old and new formats)
        preferred_windows_raw = user.preferred_study_windows
        time_windows = _parse_study_windows(preferred_windows_raw)
        
        window_ranges = []
        for start_time, end_time in time_windows:
            window_ranges.append(
                _window_to_range(day_start, (start_time, end_time), user.timezone)
            )
        
        # If no valid windows found, skip this day (don't create sessions outside preferences)
        if not window_ranges:
            plans.append(DailyPlan(day=day_start, sessions=[]))
            continue

        effective_constraints = _extract_constraints_for_day(constraints, day_date)
        available_blocks = apply_constraints(window_ranges, effective_constraints)
        sessions = _allocate_sessions_for_day(
            available_blocks,
            tasks,
            energy_level,
            user,
            current_time=reference,  # Pass reference time to skip past windows
        )
        plans.append(DailyPlan(day=day_start, sessions=sessions))

    return WeeklyPlan(
        user_id=user.id,
        generated_at=reference,
        days=plans,
    )


def _normalize_to_utc_aware(dt: datetime) -> datetime:
    """Normalize datetime to UTC-aware."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _calculate_new_deadline(
    deadline: datetime, today_start: datetime, tomorrow_start: datetime, ref: datetime
) -> datetime:
    """Calculate new deadline for rescheduling (today or tomorrow)."""
    new_deadline = today_start.replace(hour=23, minute=59)
    if ref.hour >= 20:
        new_deadline = tomorrow_start.replace(hour=23, minute=59)
    
    if deadline.hour != 23 or deadline.minute != 59:
        new_deadline = new_deadline.replace(
            hour=min(deadline.hour, 23),
            minute=min(deadline.minute, 59)
        )
    return new_deadline


def _escalate_priority(task: Task) -> None:
    """Escalate task priority if not already CRITICAL."""
    if task.priority == TaskPriority.CRITICAL:
        return
    priority_map = {
        TaskPriority.LOW: TaskPriority.MEDIUM,
        TaskPriority.MEDIUM: TaskPriority.HIGH,
        TaskPriority.HIGH: TaskPriority.CRITICAL,
    }
    task.priority = priority_map.get(task.priority, task.priority)


def _build_reschedule_summary(
    rescheduled_tasks: list[dict[str, Any]], needs_attention_tasks: list[dict[str, Any]], today: date
) -> str | None:
    """Build human-readable summary of rescheduling actions."""
    summary_parts = []
    
    if rescheduled_tasks:
        today_count = sum(1 for t in rescheduled_tasks if t["new_deadline"].date() == today)
        tomorrow_count = len(rescheduled_tasks) - today_count
        task_word = "task" if len(rescheduled_tasks) == 1 else "tasks"
        
        if today_count > 0 and tomorrow_count > 0:
            summary_parts.append(
                f"{len(rescheduled_tasks)} overdue {task_word} rescheduled "
                f"({today_count} to today, {tomorrow_count} to tomorrow)"
            )
        elif today_count > 0:
            summary_parts.append(f"{len(rescheduled_tasks)} overdue {task_word} rescheduled to today")
        else:
            summary_parts.append(f"{len(rescheduled_tasks)} overdue {task_word} rescheduled to tomorrow")
    
    if needs_attention_tasks:
        task_word = "task" if len(needs_attention_tasks) == 1 else "tasks"
        summary_parts.append(
            f"{len(needs_attention_tasks)} very overdue {task_word} need attention (> 14 days overdue)"
        )
    
    return "; ".join(summary_parts) if summary_parts else None


def _auto_reschedule_overdue_tasks(
    db: Session, user: User, reference: datetime
) -> dict[str, Any]:
    """
    Automatically reschedule overdue tasks to today or tomorrow.
    
    Returns:
        dict with keys:
        - rescheduled: list of dicts with task info and new deadline
        - needs_attention: list of very overdue tasks (> 14 days)
        - summary: human-readable summary string
    """
    ref = _normalize_to_utc_aware(reference)
    today = ref.date()
    today_start = datetime.combine(today, time.min, tzinfo=timezone.utc)
    tomorrow_start = today_start + timedelta(days=1)
    
    all_tasks = db.query(Task).filter(
        Task.user_id == user.id,
        Task.is_completed.is_(False),
        Task.is_recurring_template.is_(False),
        Task.deadline.isnot(None),
    ).all()
    
    rescheduled_tasks = []
    needs_attention_tasks = []
    
    for task in all_tasks:
        if not task.deadline:
            continue
        
        deadline = _normalize_to_utc_aware(task.deadline)
        days_overdue = (today - deadline.date()).days
        
        if days_overdue <= 0:
            continue
        
        if days_overdue > 14:
            needs_attention_tasks.append({
                "task_id": task.id,
                "title": task.title,
                "days_overdue": days_overdue,
                "original_deadline": deadline,
            })
        elif days_overdue <= 7:
            new_deadline = _calculate_new_deadline(deadline, today_start, tomorrow_start, ref)
            task.deadline = new_deadline
            _escalate_priority(task)
            
            rescheduled_tasks.append({
                "task_id": task.id,
                "title": task.title,
                "days_overdue": days_overdue,
                "original_deadline": deadline,
                "new_deadline": new_deadline,
                "new_priority": task.priority.value,
            })
    
    if rescheduled_tasks:
        db.commit()
    
    summary = _build_reschedule_summary(rescheduled_tasks, needs_attention_tasks, today)
    
    return {
        "rescheduled": rescheduled_tasks,
        "needs_attention": needs_attention_tasks,
        "summary": summary,
    }


def generate_weekly_schedule(
    db: Session, user: User, reference: datetime | None = None
) -> tuple[WeeklyPlan, dict[str, Any]]:
    """
    Generate a weekly study schedule.
    
    Returns:
        tuple: (WeeklyPlan, rescheduling_info)
        - WeeklyPlan: The generated schedule
        - rescheduling_info: Dict with info about auto-rescheduled overdue tasks
    """
    ref = reference or datetime.now(timezone.utc)
    
    # Auto-reschedule overdue tasks before generating schedule
    rescheduling_info = _auto_reschedule_overdue_tasks(db, user, ref)
    
    subjects: list[Subject] = (
        db.query(Subject).filter(Subject.user_id == user.id).all()
    )
    tasks: list[Task] = db.query(Task).filter(Task.user_id == user.id).all()
    constraints: list[ScheduleConstraint] = (
        db.query(ScheduleConstraint)
        .filter(ScheduleConstraint.user_id == user.id)
        .all()
    )
    energies: list[DailyEnergy] = (
        db.query(DailyEnergy).filter(DailyEnergy.user_id == user.id).all()
    )
    energy_map = {energy.day: energy.level for energy in energies}
    weighted_tasks = calculate_weights(tasks, subjects, ref)
    plan = build_weekly_plan(user, weighted_tasks, constraints, energy_map, ref)
    
    return plan, rescheduling_info


def micro_plan(
    db: Session, user: User, minutes: int, reference: datetime | None = None
) -> list[StudyBlock]:
    ref = reference or datetime.now(timezone.utc)
    today = ref.date()
    energy_entry = (
        db.query(DailyEnergy)
        .filter(DailyEnergy.user_id == user.id, DailyEnergy.day == today)
        .first()
    )
    energy_level = energy_entry.level if energy_entry else EnergyLevel.MEDIUM

    tasks = (
        db.query(Task)
        .filter(
            Task.user_id == user.id,
            Task.is_completed.is_(False),
            Task.is_recurring_template.is_(False)  # Exclude recurring templates
        )
        .order_by(Task.deadline.asc().nulls_last())
        .all()
    )
    subjects = (
        db.query(Subject)
        .filter(Subject.user_id == user.id)
        .all()
    )
    weighted = calculate_weights(tasks, subjects, ref)

    allocation: list[StudyBlock] = []
    remaining = timedelta(minutes=minutes)
    session_cap = timedelta(minutes=_energy_cap(energy_level, user.max_session_length))
    pointer = ref

    while remaining > timedelta(minutes=5) and weighted:
        current = weighted[0]
        session_length = min(
            session_cap,
            timedelta(minutes=current.remaining_minutes),
            remaining,
        )
        if session_length <= timedelta(minutes=10):
            weighted.pop(0)
            continue
        allocation.append(
            StudyBlock(
                start_time=pointer,
                end_time=pointer + session_length,
                subject_id=current.subject.id if current.subject else None,
                task_id=current.task.id,
                focus=current.task.title,
                energy_level=energy_level.value,
                generated_by="micro",
            )
        )
        pointer += session_length + timedelta(minutes=user.break_duration)
        remaining -= session_length
        current.remaining_minutes -= int(session_length.total_seconds() // 60)
        if current.remaining_minutes <= 0:
            weighted.pop(0)
        else:
            weighted.sort()

    return interleave_subjects(allocation)

