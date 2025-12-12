"""Workload analysis service for pre-generation warnings.

This service provides read-only analysis of workload before schedule generation.
It does not modify any data - only analyzes and provides warnings.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.constraint import ScheduleConstraint
from app.models.study_session import SessionStatus, StudySession
from app.models.subject import Subject
from app.models.task import Task
from app.models.user import User
from app.schemas.schedule import WeeklyPlan
from app.services.scheduling import _parse_study_windows, _window_to_range, _local_day_start, apply_constraints

# Constants
EXTEND_DEADLINES_SUGGESTION = "Extend deadlines for lower-priority tasks"


def _calculate_available_hours_from_windows(
    user: User
) -> dict[str, Any]:
    """Calculate available study hours from preferred study windows."""
    preferred_windows_raw = user.preferred_study_windows
    time_windows = _parse_study_windows(preferred_windows_raw)
    
    if not time_windows:
        return {
            "total_hours_per_week": 0,
            "hours_per_day": 0,
            "has_windows": False,
        }
    
    # Calculate hours per day
    hours_per_day = 0
    for start_time, end_time in time_windows:
        start_hour = start_time.hour + start_time.minute / 60
        end_hour = end_time.hour + end_time.minute / 60
        if end_hour < start_hour:  # Overnight window
            end_hour += 24
        hours_per_day += (end_hour - start_hour)
    
    total_hours_per_week = hours_per_day * 7
    
    return {
        "total_hours_per_week": total_hours_per_week,
        "hours_per_day": hours_per_day,
        "has_windows": True,
    }


def _calculate_constraint_impact(
    constraints: list[ScheduleConstraint], user: User, reference: datetime
) -> dict[str, Any]:
    # reference is used in _local_day_start call below
    """Calculate how constraints reduce available time."""
    from zoneinfo import ZoneInfo
    
    week_start = _local_day_start(reference, user.timezone)
    user_tz = ZoneInfo(user.timezone)
    
    total_blocked_hours = 0
    constraint_details = []
    
    for offset in range(7):
        day_start = week_start + timedelta(days=offset)
        # Convert to user's timezone to get correct LOCAL date
        day_start_aware = day_start.replace(tzinfo=timezone.utc)
        day_date = day_start_aware.astimezone(user_tz).date()
        
        def constraint_applies_to_day(c: ScheduleConstraint) -> bool:
            """Check if constraint applies to this day, using proper timezone conversion."""
            if c.start_datetime:
                # Convert constraint datetime to user's timezone for proper date comparison
                c_dt = c.start_datetime
                if c_dt.tzinfo is None:
                    c_dt = c_dt.replace(tzinfo=timezone.utc)
                c_local_date = c_dt.astimezone(user_tz).date()
                if c_local_date == day_date:
                    return True
            if c.start_time and c.is_recurring and day_date.weekday() in (c.days_of_week or []):
                return True
            return False
        
        day_constraints = [c for c in constraints if constraint_applies_to_day(c)]
        
        for constraint in day_constraints:
            if constraint.start_time and constraint.end_time:
                start_hour = constraint.start_time.hour + constraint.start_time.minute / 60
                end_hour = constraint.end_time.hour + constraint.end_time.minute / 60
                if end_hour < start_hour:
                    end_hour += 24
                blocked_hours = end_hour - start_hour
                total_blocked_hours += blocked_hours
                constraint_details.append({
                    "name": constraint.name,
                    "day": day_date.strftime("%A"),
                    "hours": blocked_hours,
                })
    
    return {
        "total_blocked_hours_per_week": total_blocked_hours,
        "constraints": constraint_details,
    }


def _calculate_historical_completion_rate(
    db: Session, user_id: int, weeks: int = 4
) -> float:
    """Calculate historical completion rate from past sessions."""
    cutoff_date = datetime.now(timezone.utc) - timedelta(weeks=weeks)
    
    sessions = (
        db.query(StudySession)
        .filter(
            StudySession.user_id == user_id,
            StudySession.start_time >= cutoff_date,
        )
        .all()
    )
    
    if not sessions:
        return 0.65  # Research-based default if no history
    
    total_sessions = len(sessions)
    completed_sessions = len([s for s in sessions if s.status == SessionStatus.COMPLETED])
    
    if total_sessions == 0:
        return 0.65
    
    completion_rate = completed_sessions / total_sessions
    
    # Apply slight conservatism for newer users
    if weeks < 4:
        completion_rate *= 0.9
    
    return max(0.5, min(0.95, completion_rate))  # Clamp between 50% and 95%


def _detect_deadline_risks(
    tasks: list[Task], available_hours_per_week: float, reference: datetime
) -> list[dict[str, Any]]:
    """Detect tasks that may not be completed before deadline."""
    if reference.tzinfo is None:
        ref = reference.replace(tzinfo=timezone.utc)
    else:
        ref = reference.astimezone(timezone.utc)
    
    risks = []
    
    for task in tasks:
        if not task.deadline or task.is_completed:
            continue
        
        # Normalize deadline to UTC
        deadline = task.deadline
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)
        else:
            deadline = deadline.astimezone(timezone.utc)
        
        # Calculate days until deadline
        days_until = (deadline.date() - ref.date()).days
        
        if days_until < 0:
            continue  # Already overdue (handled by auto-reschedule)
        
        # Calculate hours needed
        hours_needed = task.estimated_minutes / 60
        
        # Estimate available hours before deadline (proportional to days)
        days_available = min(days_until, 7)  # Cap at 7 days
        hours_available_before_deadline = (available_hours_per_week / 7) * days_available
        
        # Check if task can be completed
        if hours_needed > hours_available_before_deadline:
            risks.append({
                "task_id": task.id,
                "task_title": task.title,
                "hours_needed": hours_needed,
                "hours_available": hours_available_before_deadline,
                "hours_short": hours_needed - hours_available_before_deadline,
                "days_until_deadline": days_until,
                "deadline": deadline.isoformat(),
            })
    
    return risks


def _detect_deadline_clustering(
    tasks: list[Task], reference: datetime
) -> list[dict[str, Any]]:
    """Detect multiple tasks due on the same day."""
    if reference.tzinfo is None:
        ref = reference.replace(tzinfo=timezone.utc)
    else:
        ref = reference.astimezone(timezone.utc)
    
    # Group tasks by deadline date
    deadline_groups = defaultdict(list)
    
    for task in tasks:
        if not task.deadline or task.is_completed:
            continue
        
        deadline = task.deadline
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)
        else:
            deadline = deadline.astimezone(timezone.utc)
        
        deadline_date = deadline.date()
        days_until = (deadline_date - ref.date()).days
        
        if 0 <= days_until <= 7:  # Within next week
            deadline_groups[deadline_date].append({
                "task_id": task.id,
                "task_title": task.title,
                "hours": task.estimated_minutes / 60,
                "priority": task.priority.value,
            })
    
    # Find clusters (3+ tasks on same day)
    clusters = []
    for deadline_date, task_list in deadline_groups.items():
        if len(task_list) >= 3:
            total_hours = sum(t["hours"] for t in task_list)
            clusters.append({
                "deadline_date": deadline_date.isoformat(),
                "deadline_day": deadline_date.strftime("%A"),
                "task_count": len(task_list),
                "total_hours": total_hours,
                "tasks": task_list,
            })
    
    return clusters


def _check_exam_prep(
    subjects: list[Subject], tasks: list[Task], reference: datetime, user_tz_str: str = "UTC"
) -> list[dict[str, Any]]:
    """Check if subjects with upcoming exams have prep scheduled."""
    from zoneinfo import ZoneInfo
    
    if reference.tzinfo is None:
        ref = reference.replace(tzinfo=timezone.utc)
    else:
        ref = reference.astimezone(timezone.utc)
    
    # Get reference date in user's local timezone for proper comparison
    try:
        user_tz = ZoneInfo(user_tz_str)
        ref_local_date = ref.astimezone(user_tz).date()
    except Exception:
        ref_local_date = ref.date()
    
    missing_prep = []
    
    for subject in subjects:
        if not subject.exam_date:
            continue
        
        days_until_exam = (subject.exam_date - ref_local_date).days
        
        # Check if exam is in next 2-4 weeks
        if 14 <= days_until_exam <= 28:
            # Check if there are tasks for this subject
            subject_tasks = [t for t in tasks if t.subject_id == subject.id and not t.is_completed]
            
            if not subject_tasks:
                missing_prep.append({
                    "subject_id": subject.id,
                    "subject_name": subject.name,
                    "exam_date": subject.exam_date.isoformat(),
                    "days_until_exam": days_until_exam,
                })
    
    return missing_prep


def analyze_pre_generation(
    db: Session, user: User, reference: datetime | None = None
) -> dict[str, Any]:
    """
    Analyze workload before schedule generation.
    
    This is a read-only analysis that does not modify any data.
    Returns warnings and suggestions for the user.
    """
    ref = reference or datetime.now(timezone.utc)
    
    # Fetch data
    tasks = (
        db.query(Task)
        .filter(
            Task.user_id == user.id,
            Task.is_completed.is_(False),
            Task.is_recurring_template.is_(False),
        )
        .all()
    )
    
    subjects = (
        db.query(Subject)
        .filter(Subject.user_id == user.id)
        .all()
    )
    
    constraints = (
        db.query(ScheduleConstraint)
        .filter(ScheduleConstraint.user_id == user.id)
        .all()
    )
    
    # Calculate metrics
    window_info = _calculate_available_hours_from_windows(user)
    constraint_info = _calculate_constraint_impact(constraints, user, ref)
    completion_rate = _calculate_historical_completion_rate(db, user.id)
    
    # Calculate available hours (after constraints)
    available_hours = window_info["total_hours_per_week"]
    if constraint_info["total_blocked_hours_per_week"] > 0:
        available_hours -= constraint_info["total_blocked_hours_per_week"]
    available_hours = max(0, available_hours)
    
    # Calculate task hours
    total_task_hours = sum(task.estimated_minutes for task in tasks) / 60
    
    # Calculate realistic capacity
    realistic_capacity = user.weekly_study_hours * completion_rate
    
    # Detect issues
    deadline_risks = _detect_deadline_risks(tasks, available_hours, ref)
    deadline_clusters = _detect_deadline_clustering(tasks, ref)
    exam_prep_missing = _check_exam_prep(subjects, tasks, ref, user.timezone)
    
    # Generate warnings
    warnings = []
    
    # Warning 1: Total hours > capacity
    if total_task_hours > realistic_capacity * 1.5:
        warnings.append({
            "type": "capacity_exceeded",
            "severity": "hard",
            "title": "Workload Exceeded",
            "message": f"You have {total_task_hours:.1f} hours of work this week, but your realistic capacity is ~{realistic_capacity:.1f} hours (based on {completion_rate:.0%} completion rate).",
            "suggestions": [
                f"Increase weekly goal from {user.weekly_study_hours}h to {int(total_task_hours / completion_rate)}h (temporary)",
                f"Move {int((total_task_hours - realistic_capacity) / 2)} hours of tasks to next week",
                EXTEND_DEADLINES_SUGGESTION,
            ],
        })
    elif total_task_hours > realistic_capacity * 1.3:
        warnings.append({
            "type": "capacity_exceeded",
            "severity": "soft",
            "title": "Heavy Workload",
            "message": f"You have {total_task_hours:.1f} hours of work this week, but your realistic capacity is ~{realistic_capacity:.1f} hours.",
            "suggestions": [
                f"Consider increasing weekly goal to {int(total_task_hours / completion_rate)}h",
                "Or move some tasks to next week",
            ],
        })
    
    # Warning 2: Available time insufficient
    if total_task_hours > available_hours:
        hours_short = total_task_hours - available_hours
        warnings.append({
            "type": "time_insufficient",
            "severity": "hard",
            "title": "Time Window Constraint",
            "message": f"You have {total_task_hours:.1f} hours of tasks, but only {available_hours:.1f} hours available in your study windows this week.",
            "suggestions": [
                f"Expand study windows: Add {hours_short / 7:.1f} hours/day this week",
                f"Move {hours_short:.1f} hours of tasks to next week",
                EXTEND_DEADLINES_SUGGESTION,
            ],
        })
    
    # Warning 3: Goal vs available time mismatch
    if user.weekly_study_hours > available_hours:
        warnings.append({
            "type": "goal_mismatch",
            "severity": "soft",
            "title": "Goal Mismatch",
            "message": f"Your weekly goal is {user.weekly_study_hours} hours, but your study windows only allow {available_hours:.1f} hours/week.",
            "suggestions": [
                f"Expand study windows to match your goal (add {user.weekly_study_hours - available_hours:.1f}h/week)",
                f"Reduce weekly goal to {int(available_hours)}h (realistic)",
            ],
        })
    
    # Warning 4: Deadline risks
    if deadline_risks:
        high_risk = [r for r in deadline_risks if r["hours_short"] > 2]
        if high_risk:
            warnings.append({
                "type": "deadline_risk",
                "severity": "hard",
                "title": "Deadline Risk",
                "message": f"{len(high_risk)} task(s) may not be completed on time with current schedule.",
                "tasks": [{"title": r["task_title"], "hours_short": r["hours_short"]} for r in high_risk],
                "suggestions": [
                    f"Add {sum(r['hours_short'] for r in high_risk):.1f} hours to study windows this week",
                    "Request deadline extensions",
                    "Start these tasks earlier",
                ],
            })
    
    # Warning 5: Deadline clustering
    if deadline_clusters:
        warnings.append({
            "type": "deadline_clustering",
            "severity": "soft",
            "title": "Deadline Clustering",
            "message": "Multiple tasks due on the same day detected.",
            "clusters": deadline_clusters,
            "suggestions": [
                "Start tasks earlier to avoid last-minute rush",
                "Request deadline extensions for lower-priority tasks",
            ],
        })
    
    # Warning 6: Exam prep missing
    if exam_prep_missing:
        warnings.append({
            "type": "exam_prep_missing",
            "severity": "hard",
            "title": "Exam Prep Missing",
            "message": f"{len(exam_prep_missing)} subject(s) with upcoming exams have no prep scheduled.",
            "subjects": exam_prep_missing,
            "suggestions": [
                "Add 8-10 hours of prep this week for each exam",
                "Create review tasks",
                "Schedule daily review sessions",
            ],
        })
    
    # Warning 7: Constraints blocking time
    if constraint_info["total_blocked_hours_per_week"] > available_hours * 0.3:
        warnings.append({
            "type": "constraints_impact",
            "severity": "soft",
            "title": "Constraints Impact",
            "message": f"Your constraints block {constraint_info['total_blocked_hours_per_week']:.1f} hours/week, reducing available time significantly.",
            "suggestions": [
                "Review and modify constraints if possible",
                "Expand study windows to compensate",
            ],
        })
    
    return {
        "warnings": warnings,
        "metrics": {
            "total_task_hours": total_task_hours,
            "available_hours_per_week": available_hours,
            "realistic_capacity": realistic_capacity,
            "completion_rate": completion_rate,
            "weekly_goal": user.weekly_study_hours,
            "hours_per_day": window_info["hours_per_day"],
        },
    }


def _collect_schedule_data(plan: WeeklyPlan) -> tuple[dict[date, float], set[int]]:
    """Collect scheduled hours per day and scheduled task IDs."""
    daily_scheduled_hours = {}
    scheduled_task_ids = set()
    
    for day_plan in plan.days:
        if isinstance(day_plan.day, datetime):
            day_date = day_plan.day.date()
        else:
            day_date = day_plan.day
        total_minutes = sum(
            int((block.end_time - block.start_time).total_seconds() // 60)
            for block in day_plan.sessions
        )
        daily_scheduled_hours[day_date] = total_minutes / 60
        
        for block in day_plan.sessions:
            if block.task_id:
                scheduled_task_ids.add(block.task_id)
    
    return daily_scheduled_hours, scheduled_task_ids


def _check_day_overloads(
    daily_scheduled_hours: dict[date, float], hours_per_day: float
) -> list[dict[str, Any]]:
    """Check for days with scheduled hours exceeding available hours."""
    day_overloads = []
    for day_date, scheduled_hours in daily_scheduled_hours.items():
        if scheduled_hours > hours_per_day:
            day_overloads.append({
                "day": day_date.strftime("%A"),
                "scheduled_hours": scheduled_hours,
                "available_hours": hours_per_day,
                "overflow": scheduled_hours - hours_per_day,
            })
    
    if not day_overloads:
        return []
    
    max_overload = max(day_overloads, key=lambda x: x["overflow"])
    return [{
        "type": "day_overload",
        "severity": "hard",
        "title": "Day Overload",
        "message": f"{max_overload['day']} has {max_overload['scheduled_hours']:.1f} hours scheduled, but only {max_overload['available_hours']:.1f} hours available in your study windows.",
        "overloads": day_overloads,
        "suggestions": [
            f"Expand study windows for {max_overload['day']}: Add {max_overload['overflow']:.1f} hours",
            f"Move {max_overload['overflow']:.1f} hours of tasks from {max_overload['day']} to other days",
            "Or redistribute workload across the week",
        ],
    }]


def _check_unscheduled_tasks(unscheduled_tasks: list[Task], unscheduled_hours: float) -> list[dict[str, Any]]:
    """Check for tasks that couldn't be scheduled."""
    if not unscheduled_tasks:
        return []
    
    return [{
        "type": "unscheduled_tasks",
        "severity": "hard",
        "title": "Unscheduled Tasks",
        "message": f"{len(unscheduled_tasks)} task(s) ({unscheduled_hours:.1f} hours) couldn't be scheduled into your available time windows.",
        "tasks": [
            {
                "title": task.title,
                "hours": task.estimated_minutes / 60,
                "priority": task.priority.value,
                "deadline": task.deadline.isoformat() if task.deadline else None,
            }
            for task in unscheduled_tasks[:5]
        ],
        "suggestions": [
            f"Expand study windows: Add {unscheduled_hours / 7:.1f} hours/day this week",
            f"Move {unscheduled_hours:.1f} hours of tasks to next week",
            "Extend deadlines for lower-priority tasks",
            f"Or increase weekly goal to accommodate {unscheduled_hours:.1f} more hours",
        ],
    }]


def _check_schedule_imbalance(daily_scheduled_hours: dict[date, float]) -> list[dict[str, Any]]:
    """Check for imbalanced schedule distribution."""
    if not daily_scheduled_hours:
        return []
    
    scheduled_hours_list = list(daily_scheduled_hours.values())
    max_hours = max(scheduled_hours_list)
    min_hours = min(scheduled_hours_list)
    imbalance_ratio = max_hours / min_hours if min_hours > 0 else float('inf')
    
    if imbalance_ratio <= 2.5:
        return []
    
    max_day = max(daily_scheduled_hours.items(), key=lambda x: x[1])
    min_day = min(daily_scheduled_hours.items(), key=lambda x: x[1])
    
    return [{
        "type": "schedule_imbalance",
        "severity": "soft",
        "title": "Schedule Imbalance",
        "message": f"{max_day[0].strftime('%A')} ({max_hours:.1f}h) vs {min_day[0].strftime('%A')} ({min_hours:.1f}h) = {imbalance_ratio:.1f}x difference.",
        "suggestions": [
            f"Redistribute: Move {((max_hours - min_hours) / 2):.1f} hours from {max_day[0].strftime('%A')} to {min_day[0].strftime('%A')}",
            "Or spread workload more evenly across the week",
        ],
    }]


def _check_consecutive_heavy_days(daily_scheduled_hours: dict[date, float]) -> list[dict[str, Any]]:
    """Check for consecutive heavy days (burnout risk)."""
    sorted_days = sorted(daily_scheduled_hours.items(), key=lambda x: x[0])
    consecutive_heavy = []
    current_streak = []
    
    for day_date, hours in sorted_days:
        if hours > 6:
            current_streak.append((day_date, hours))
        else:
            if len(current_streak) >= 3:
                consecutive_heavy.append(current_streak)
            current_streak = []
    
    if current_streak and len(current_streak) >= 3:
        consecutive_heavy.append(current_streak)
    
    if not consecutive_heavy:
        return []
    
    longest_streak = max(consecutive_heavy, key=len)
    total_hours = sum(h for _, h in longest_streak)
    return [{
        "type": "consecutive_heavy_days",
        "severity": "soft",
        "title": "Consecutive Heavy Days",
        "message": f"{len(longest_streak)} consecutive heavy days ({total_hours:.1f}h total) - burnout risk.",
        "days": [d.strftime("%A") for d, _ in longest_streak],
        "suggestions": [
            f"Redistribute: Move {total_hours / len(longest_streak):.1f} hours to lighter days",
            "Add buffer days between heavy days",
        ],
    }]


def _normalize_to_utc(dt: datetime) -> datetime:
    """Normalize datetime to UTC."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _check_tight_deadlines(
    plan: WeeklyPlan, all_tasks: list[Task]
) -> list[dict[str, Any]]:
    """Check for tasks scheduled too close to deadline."""
    task_last_session = {}
    for day_plan in plan.days:
        for block in day_plan.sessions:
            if block.task_id:
                task_last_session[block.task_id] = max(
                    task_last_session.get(block.task_id, block.end_time),
                    block.end_time
                )
    
    tight_deadlines = []
    for task_id, last_session_end in task_last_session.items():
        task = next((t for t in all_tasks if t.id == task_id), None)
        if not task or not task.deadline:
            continue
        
        deadline = _normalize_to_utc(task.deadline)
        session_end = _normalize_to_utc(last_session_end)
        buffer_hours = (deadline - session_end).total_seconds() / 3600
        
        if 0 < buffer_hours < 2:
            tight_deadlines.append({
                "task_id": task.id,
                "task_title": task.title,
                "deadline": deadline.isoformat(),
                "last_session_end": session_end.isoformat(),
                "buffer_hours": buffer_hours,
            })
    
    if not tight_deadlines:
        return []
    
    return [{
        "type": "no_deadline_buffer",
        "severity": "soft",
        "title": "Tight Deadline Schedule",
        "message": f"{len(tight_deadlines)} task(s) scheduled to complete very close to deadline (< 2h buffer).",
        "tasks": [
            {
                "title": td["task_title"],
                "buffer_hours": td["buffer_hours"],
                "deadline": td["deadline"],
            }
            for td in tight_deadlines
        ],
        "suggestions": [
            "Complete these tasks 1 day earlier for safety",
            "Add 2-hour buffer before deadline",
            "Start these tasks earlier in the week",
        ],
    }]


def _check_constraints_blocking_all_time(
    plan: WeeklyPlan, user: User, constraints: list[ScheduleConstraint], reference: datetime
) -> list[dict[str, Any]]:
    """Check for days where constraints block all available study time."""
    if not constraints:
        return []
    
    blocked_days = []
    week_start = _local_day_start(reference, user.timezone)
    from zoneinfo import ZoneInfo
    user_tz = ZoneInfo(user.timezone)
    
    for offset in range(7):
        day_start = week_start + timedelta(days=offset)
        # Convert to user's timezone to get correct LOCAL date
        day_start_aware = day_start.replace(tzinfo=timezone.utc)
        day_date = day_start_aware.astimezone(user_tz).date()
        
        # Check if this day has study windows configured
        preferred_windows_raw = user.preferred_study_windows
        time_windows = _parse_study_windows(preferred_windows_raw)
        
        if not time_windows:
            continue  # No windows configured, skip
        
        # Convert windows to datetime ranges
        window_ranges = []
        for start_time, end_time in time_windows:
            window_ranges.append(
                _window_to_range(day_start, (start_time, end_time), user.timezone)
            )
        
        if not window_ranges:
            continue  # No valid windows, skip
        
        # Check constraints for this day
        effective_constraints = []
        weekday = day_date.weekday()
        for constraint in constraints:
            if constraint.is_recurring:
                if constraint.days_of_week and weekday in constraint.days_of_week:
                    effective_constraints.append(constraint)
            else:
                if constraint.start_datetime and constraint.end_datetime:
                    # Convert constraint datetimes to user's timezone for proper comparison
                    c_start = constraint.start_datetime
                    c_end = constraint.end_datetime
                    if c_start.tzinfo is None:
                        c_start = c_start.replace(tzinfo=timezone.utc)
                    if c_end.tzinfo is None:
                        c_end = c_end.replace(tzinfo=timezone.utc)
                    c_start_local = c_start.astimezone(user_tz).date()
                    c_end_local = c_end.astimezone(user_tz).date()
                    if c_start_local <= day_date <= c_end_local:
                        effective_constraints.append(constraint)
        
        if not effective_constraints:
            continue  # No constraints for this day
        
        # Check if all windows are blocked
        available_blocks = apply_constraints(window_ranges, effective_constraints)
        
        # Check if this day has no sessions in the plan
        day_plan = next((d for d in plan.days if isinstance(d.day, datetime) and d.day.date() == day_date or isinstance(d.day, date) and d.day == day_date), None)
        has_sessions = day_plan and len(day_plan.sessions) > 0
        
        # If windows exist but all are blocked and no sessions were created, it's a problem
        if available_blocks == [] and not has_sessions:
            constraint_names = [c.name for c in effective_constraints]
            blocked_days.append({
                "day": day_date.strftime("%A"),
                "date": day_date.isoformat(),
                "constraints": constraint_names,
            })
    
    if not blocked_days:
        return []
    
    return [{
        "type": "constraints_blocking_all_time",
        "severity": "hard",
        "title": "Constraints Blocking All Study Time",
        "message": f"Constraints block all available study time on {len(blocked_days)} day(s), preventing any sessions from being scheduled.",
        "blocked_days": blocked_days,
        "suggestions": [
            "Review and modify constraints that overlap with your study windows",
            "Adjust study window times to avoid constraint conflicts",
            "Remove or reschedule constraints if possible",
        ],
    }]


def analyze_post_generation(
    plan: WeeklyPlan,
    db: Session,
    user: User,
    reference: datetime | None = None,  # Reserved for future use
) -> dict[str, Any]:
    """
    Analyze workload after schedule generation.
    
    This is a read-only analysis that does not modify any data.
    Returns warnings about the generated schedule.
    """
    ref = reference or datetime.now(timezone.utc)
    all_tasks = (
        db.query(Task)
        .filter(
            Task.user_id == user.id,
            Task.is_completed.is_(False),
            Task.is_recurring_template.is_(False),
        )
        .all()
    )
    
    constraints = (
        db.query(ScheduleConstraint)
        .filter(ScheduleConstraint.user_id == user.id)
        .all()
    )
    
    window_info = _calculate_available_hours_from_windows(user)
    hours_per_day = window_info["hours_per_day"]
    
    daily_scheduled_hours, scheduled_task_ids = _collect_schedule_data(plan)
    
    unscheduled_tasks = [task for task in all_tasks if task.id not in scheduled_task_ids]
    unscheduled_hours = sum(task.estimated_minutes for task in unscheduled_tasks) / 60
    
    warnings = []
    warnings.extend(_check_day_overloads(daily_scheduled_hours, hours_per_day))
    warnings.extend(_check_unscheduled_tasks(unscheduled_tasks, unscheduled_hours))
    warnings.extend(_check_schedule_imbalance(daily_scheduled_hours))
    warnings.extend(_check_consecutive_heavy_days(daily_scheduled_hours))
    warnings.extend(_check_tight_deadlines(plan, all_tasks))
    warnings.extend(_check_constraints_blocking_all_time(plan, user, constraints, ref))
    
    scheduled_hours_list = list(daily_scheduled_hours.values()) if daily_scheduled_hours else [0]
    max_hours = max(scheduled_hours_list) if scheduled_hours_list else 0
    min_hours = min(scheduled_hours_list) if scheduled_hours_list else 0
    imbalance_ratio = max_hours / min_hours if min_hours > 0 else 1.0
    
    return {
        "warnings": warnings,
        "metrics": {
            "total_scheduled_hours": sum(daily_scheduled_hours.values()),
            "unscheduled_hours": unscheduled_hours,
            "unscheduled_task_count": len(unscheduled_tasks),
            "daily_distribution": {
                day.strftime("%A"): hours
                for day, hours in daily_scheduled_hours.items()
            },
            "imbalance_ratio": imbalance_ratio,
        },
    }

