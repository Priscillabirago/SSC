"""Service for managing recurring tasks and generating instances"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable

from sqlalchemy.orm import Session

from app.models.task import Task


def _calculate_daily_next(base_date: date, pattern: dict[str, Any]) -> date:
    """Calculate next date for daily frequency."""
    interval = pattern.get("interval", 1)
    next_date = base_date + timedelta(days=interval)
    weekdays_only = pattern.get("weekdays_only", False)
    if weekdays_only:
        while next_date.weekday() >= 5:
            next_date += timedelta(days=1)
    return next_date


def _calculate_weekly_next(
    base_date: date,
    start_date: date,
    pattern: dict[str, Any],
) -> date:
    """Calculate next date for weekly frequency."""
    interval = pattern.get("interval", 1)
    days_of_week = pattern.get("days_of_week", [base_date.weekday()])
    if not days_of_week:
        days_of_week = [base_date.weekday()]
    
    current_weekday = base_date.weekday()
    next_occurrence = None
    
    for day in sorted(days_of_week):
        if day > current_weekday:
            days_ahead = day - current_weekday
            next_occurrence = base_date + timedelta(days=days_ahead)
            break
    
    if next_occurrence is None:
        first_day = min(days_of_week)
        days_ahead = 7 - current_weekday + first_day + (interval - 1) * 7
        next_occurrence = base_date + timedelta(days=days_ahead)
    elif interval > 1:
        weeks_since_start = (base_date - start_date).days // 7
        if weeks_since_start % interval != 0:
            weeks_to_add = interval - (weeks_since_start % interval)
            next_occurrence += timedelta(weeks=weeks_to_add)
    
    return next_occurrence


def _calculate_biweekly_next(base_date: date, pattern: dict[str, Any]) -> date:
    """Calculate next date for biweekly frequency."""
    days_of_week = pattern.get("days_of_week", [base_date.weekday()])
    if not days_of_week:
        days_of_week = [base_date.weekday()]
    
    current_weekday = base_date.weekday()
    next_occurrence = None
    
    for day in sorted(days_of_week):
        if day > current_weekday:
            days_ahead = day - current_weekday
            next_occurrence = base_date + timedelta(days=days_ahead)
            break
    
    if next_occurrence is None:
        first_day = min(days_of_week)
        days_ahead = 14 - current_weekday + first_day
        next_occurrence = base_date + timedelta(days=days_ahead)
    
    return next_occurrence


def _calculate_monthly_next(base_date: date, pattern: dict[str, Any]) -> date:
    """Calculate next date for monthly frequency."""
    day_of_month = pattern.get("day_of_month")
    week_of_month = pattern.get("week_of_month")
    
    if day_of_month:
        next_date = base_date.replace(day=1) + timedelta(days=32)
        next_date = next_date.replace(day=1)
        try:
            next_date = next_date.replace(day=day_of_month)
        except ValueError:
            next_date = (next_date.replace(day=1) - timedelta(days=1)).replace(day=day_of_month)
            if next_date.day != day_of_month:
                next_date = (next_date.replace(day=1) + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        return next_date
    
    if week_of_month:
        days_of_week = pattern.get("days_of_week", [0])
        target_weekday = days_of_week[0] if days_of_week else 0
        next_date = base_date.replace(day=1) + timedelta(days=32)
        next_date = next_date.replace(day=1)
        first_weekday = next_date.weekday()
        days_to_add = (target_weekday - first_weekday) % 7 + (week_of_month - 1) * 7
        next_date += timedelta(days=days_to_add)
        return next_date
    
    return base_date


def _convert_to_datetime(next_date: date, start_date: datetime) -> datetime:
    """Convert date to datetime with timezone from start_date."""
    next_datetime = datetime.combine(next_date, start_date.time())
    if start_date.tzinfo:
        next_datetime = next_datetime.replace(tzinfo=start_date.tzinfo)
    else:
        next_datetime = next_datetime.replace(tzinfo=timezone.utc)
    return next_datetime


def _check_end_date(next_datetime: datetime, end_date: datetime | None) -> bool:
    """Check if next_datetime is past end_date."""
    if not end_date:
        return False
    end_date_utc = end_date.replace(tzinfo=timezone.utc) if end_date.tzinfo is None else end_date.astimezone(timezone.utc)
    next_datetime_utc = next_datetime.astimezone(timezone.utc) if next_datetime.tzinfo else next_datetime.replace(tzinfo=timezone.utc)
    return next_datetime_utc > end_date_utc


def calculate_next_occurrence(
    pattern: dict[str, Any],
    last_occurrence_date: datetime | None,
    start_date: datetime,
    end_date: datetime | None = None,
) -> datetime | None:
    """
    Calculate the next occurrence date based on recurrence pattern.
    
    Args:
        pattern: Recurrence pattern dict
        last_occurrence_date: Last generated occurrence (None for first)
        start_date: Start date (deadline of template or first occurrence)
        end_date: Optional end date (recurrence_end_date)
    
    Returns:
        Next occurrence datetime or None if past end_date
    """
    if not pattern or "frequency" not in pattern:
        return None
    
    frequency = pattern.get("frequency", "weekly")
    base_date = last_occurrence_date.date() if last_occurrence_date else start_date.date()
    
    if end_date and base_date >= end_date.date():
        return None
    
    if frequency == "daily":
        next_date = _calculate_daily_next(base_date, pattern)
    elif frequency == "weekly":
        next_date = _calculate_weekly_next(base_date, start_date.date(), pattern)
    elif frequency == "biweekly":
        next_date = _calculate_biweekly_next(base_date, pattern)
    elif frequency == "monthly":
        next_date = _calculate_monthly_next(base_date, pattern)
    else:
        return None
    
    next_datetime = _convert_to_datetime(next_date, start_date)
    
    if _check_end_date(next_datetime, end_date):
        return None
    
    return next_datetime


def _get_last_occurrence_date(existing_instances: list[Task]) -> datetime | None:
    """Get the deadline of the last generated occurrence."""
    if not existing_instances:
        return None
    last_occurrence = max(
        existing_instances,
        key=lambda t: t.deadline or datetime.min.replace(tzinfo=timezone.utc)
    )
    return last_occurrence.deadline


def _calculate_start_date(
    template: Task,
    last_occurrence_date: datetime | None,
    normalize_to_utc: Callable[[datetime | None], datetime | None],
) -> datetime | None:
    """Calculate the start date for instance generation."""
    start_date = last_occurrence_date or template.deadline
    if not start_date:
        start_date = template.created_at
    return normalize_to_utc(start_date)


def _instance_exists_for_date(
    existing_instances: list[Task],
    deadline: datetime,
) -> bool:
    """Check if an instance already exists for the given deadline date."""
    deadline_date = deadline.date() if isinstance(deadline, datetime) else deadline
    return any(
        inst.deadline and inst.deadline.date() == deadline_date
        for inst in existing_instances
    )


def _update_template_next_occurrence_with_advance(
    template: Task,
    pattern: dict[str, Any],
    current_deadline: datetime | None,
) -> None:
    """Update template's next_occurrence_date with advance_days consideration."""
    if not current_deadline:
        return
    advance_days = pattern.get("advance_days", 0)
    if advance_days > 0:
        template.next_occurrence_date = current_deadline - timedelta(days=advance_days)
    else:
        template.next_occurrence_date = current_deadline


def _generate_instances_loop(
    db: Session,
    template: Task,
    pattern: dict[str, Any],
    start_date: datetime,
    target_date: datetime,
    end_date: datetime | None,
    existing_instances: list[Task],
    force_regenerate: bool,
    normalize_to_utc: Callable[[datetime | None], datetime | None],
) -> tuple[list[Task], datetime | None]:
    """Generate instances in a loop, returning new instances and final deadline."""
    new_instances = []
    current_deadline = start_date
    
    while current_deadline and current_deadline <= target_date:
        if end_date and current_deadline > end_date:
            break
        
        if not force_regenerate and _instance_exists_for_date(existing_instances, current_deadline):
            next_deadline = calculate_next_occurrence(
                pattern, current_deadline, start_date, end_date
            )
            current_deadline = normalize_to_utc(next_deadline) if next_deadline else None
            continue
        
        instance = _create_task_instance(template, current_deadline)
        db.add(instance)
        new_instances.append(instance)
        
        next_deadline = calculate_next_occurrence(
            pattern, current_deadline, start_date, end_date
        )
        current_deadline = normalize_to_utc(next_deadline) if next_deadline else None
    
    return new_instances, current_deadline


def generate_recurring_instances(
    db: Session,
    template: Task,
    weeks_ahead: int = 4,
    force_regenerate: bool = False,
) -> list[Task]:
    """
    Generate recurring task instances for a template.
    
    Args:
        db: Database session
        template: The recurring task template
        weeks_ahead: How many weeks ahead to generate
        force_regenerate: If True, regenerate even if instances exist
    
    Returns:
        List of newly created task instances
    """
    if not template.is_recurring_template or not template.recurrence_pattern:
        return []
    
    pattern = template.recurrence_pattern
    end_date = template.recurrence_end_date
    
    # Helper to normalize datetime to UTC (timezone-aware)
    def normalize_to_utc(dt: datetime | None) -> datetime | None:
        if dt is None:
            return None
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    
    now = datetime.now(timezone.utc)
    target_date = now + timedelta(weeks=weeks_ahead)
    
    if end_date:
        end_date = normalize_to_utc(end_date)
        if end_date and target_date > end_date:
            target_date = end_date
    
    existing_instances = (
        db.query(Task)
        .filter(
            Task.recurring_template_id == template.id,
            Task.user_id == template.user_id,
        )
        .order_by(Task.deadline.asc().nulls_last())
        .all()
    )
    
    last_occurrence_date = _get_last_occurrence_date(existing_instances)
    start_date = _calculate_start_date(template, last_occurrence_date, normalize_to_utc)
    
    if not start_date:
        return []
    
    new_instances, current_deadline = _generate_instances_loop(
        db, template, pattern, start_date, target_date, end_date,
        existing_instances, force_regenerate, normalize_to_utc
    )
    
    if new_instances:
        _update_template_next_occurrence_with_advance(template, pattern, current_deadline)
        db.commit()
        for instance in new_instances:
            db.refresh(instance)
    
    return new_instances


def update_uncompleted_instances_for_new_pattern(
    db: Session,
    template: Task,
    new_pattern: dict[str, Any],
) -> list[Task]:
    """
    Update uncompleted instances when recurrence pattern changes.
    
    Only updates instances that:
    - Are not completed
    - Are not in progress
    - Have no time tracked
    
    Args:
        db: Database session
        template: The recurring task template
        new_pattern: The new recurrence pattern
    
    Returns:
        List of updated instances
    """
    if not template.is_recurring_template:
        return []
    
    # Get all uncompleted instances that should be updated
    instances_to_update = (
        db.query(Task)
        .filter(
            Task.recurring_template_id == template.id,
            Task.user_id == template.user_id,
            Task.is_completed.is_(False),
            Task.status.notin_(["completed", "in_progress"]),
            Task.actual_minutes_spent.is_(None) | (Task.actual_minutes_spent == 0)
        )
        .order_by(Task.deadline.asc().nulls_last())
        .all()
    )
    
    if not instances_to_update:
        return []
    
    # Helper to normalize datetime to UTC
    def normalize_to_utc(dt: datetime | None) -> datetime | None:
        if dt is None:
            return None
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    
    # Get the template's start date (original deadline or created_at)
    start_date = template.deadline or template.created_at
    start_date = normalize_to_utc(start_date)
    if not start_date:
        return []
    
    end_date = normalize_to_utc(template.recurrence_end_date)
    
    # Recalculate deadlines for each instance based on new pattern
    updated_instances = []
    last_deadline = start_date
    
    for instance in instances_to_update:
        # Calculate what the deadline should be based on new pattern
        # Use the instance's position in the sequence
        new_deadline = calculate_next_occurrence(
            new_pattern,
            last_deadline,
            start_date,
            end_date
        )
        
        if not new_deadline:
            # Past end date, delete this instance
            db.delete(instance)
            continue
        
        new_deadline = normalize_to_utc(new_deadline)
        
        # Update the instance's deadline
        instance.deadline = new_deadline
        # Also update other fields from template (in case they changed)
        instance.title = template.title
        instance.description = template.description
        instance.priority = template.priority
        instance.estimated_minutes = template.estimated_minutes
        instance.subject_id = template.subject_id
        
        updated_instances.append(instance)
        last_deadline = new_deadline
    
    if updated_instances:
        db.commit()
        for instance in updated_instances:
            db.refresh(instance)
    
    return updated_instances


def _normalize_to_utc(dt: datetime | None) -> datetime | None:
    """Normalize datetime to UTC."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _check_instance_exists(db: Session, template: Task, next_date: datetime) -> bool:
    """Check if an instance already exists for the given date."""
    next_date_only = next_date.date()
    existing = db.query(Task).filter(
        Task.recurring_template_id == template.id,
        Task.user_id == template.user_id,
    ).first()
    
    if existing and existing.deadline:
        existing_date = existing.deadline.date()
        if existing_date == next_date_only:
            return True
    return existing is not None


def _create_task_instance(template: Task, deadline: datetime) -> Task:
    """Create a new task instance from template."""
    return Task(
        user_id=template.user_id,
        subject_id=template.subject_id,
        title=template.title,
        description=template.description,
        deadline=deadline,
        estimated_minutes=template.estimated_minutes,
        priority=template.priority,
        status=template.status,
        subtasks=template.subtasks,
        is_recurring_template=False,
        recurring_template_id=template.id,
    )


def _update_template_next_occurrence(
    template: Task,
    pattern: dict[str, Any],
    next_date: datetime,
    completed_deadline: datetime,
    end_date: datetime | None,
) -> None:
    """Update template's next_occurrence_date."""
    next_next_date = calculate_next_occurrence(
        pattern, next_date, completed_deadline, end_date
    )
    if next_next_date:
        template.next_occurrence_date = _normalize_to_utc(next_next_date)


def generate_next_instance_on_completion(
    db: Session,
    completed_instance: Task,
) -> Task | None:
    """
    When a recurring task instance is completed, generate the next one.
    
    Args:
        db: Database session
        completed_instance: The completed task instance
    
    Returns:
        Newly created next instance or None
    """
    if not completed_instance.recurring_template_id:
        return None
    
    template = db.query(Task).filter(
        Task.id == completed_instance.recurring_template_id,
        Task.is_recurring_template.is_(True),
    ).first()
    
    if not template or not template.recurrence_pattern:
        return None
    
    if not completed_instance.deadline:
        return None
    
    pattern = template.recurrence_pattern
    end_date = template.recurrence_end_date
    completed_deadline = _normalize_to_utc(completed_instance.deadline)
    
    next_date = calculate_next_occurrence(
        pattern, completed_deadline, completed_deadline, end_date
    )
    
    if not next_date:
        return None
    
    next_date = _normalize_to_utc(next_date)
    
    if _check_instance_exists(db, template, next_date):
        return None
    
    next_instance = _create_task_instance(template, next_date)
    db.add(next_instance)
    db.commit()
    db.refresh(next_instance)
    
    _update_template_next_occurrence(template, pattern, next_date, completed_deadline, end_date)
    db.commit()
    
    return next_instance


def remove_recurrence(
    db: Session,
    template: Task,
) -> int:
    """
    Remove recurrence from a template by deleting all future uncompleted instances
    and clearing recurring_template_id from remaining instances.
    
    Args:
        db: Database session
        template: The recurring task template to remove recurrence from
    
    Returns:
        Number of instances deleted
    """
    if not template.is_recurring_template:
        return 0
    
    # Delete all future uncompleted instances
    # This includes instances with future deadlines OR instances without deadlines (created but not yet due)
    now = datetime.now(timezone.utc)
    instances_to_delete = (
        db.query(Task)
        .filter(
            Task.recurring_template_id == template.id,
            Task.user_id == template.user_id,
            Task.is_completed.is_(False),
            # Delete if: has future deadline OR no deadline (assume future if no deadline)
            (Task.deadline.is_(None) | (Task.deadline.isnot(None) & (Task.deadline > now)))
        )
        .all()
    )
    
    count = len(instances_to_delete)
    for instance in instances_to_delete:
        db.delete(instance)
    
    # Clear recurring_template_id from remaining instances (completed and past uncompleted)
    # This makes them regular tasks and prevents "Manage Series" from appearing
    remaining_instances = (
        db.query(Task)
        .filter(
            Task.recurring_template_id == template.id,
            Task.user_id == template.user_id,
        )
        .all()
    )
    
    for instance in remaining_instances:
        instance.recurring_template_id = None
    
    # Clear recurrence fields from template
    template.is_recurring_template = False
    template.recurrence_pattern = None
    template.recurrence_end_date = None
    template.next_occurrence_date = None
    
    if count > 0 or remaining_instances:
        db.commit()
    
    return count


def cleanup_instances_past_end_date(
    db: Session,
    template: Task,
) -> int:
    """
    Delete all instances that are past the recurrence end date.
    
    Args:
        db: Database session
        template: The recurring task template
    
    Returns:
        Number of instances deleted
    """
    if not template.is_recurring_template or not template.recurrence_end_date:
        return 0
    
    end_date = template.recurrence_end_date
    if end_date.tzinfo is None:
        end_date = end_date.replace(tzinfo=timezone.utc)
    else:
        end_date = end_date.astimezone(timezone.utc)
    
    # Delete all instances past the end date (including completed ones)
    instances_to_delete = (
        db.query(Task)
        .filter(
            Task.recurring_template_id == template.id,
            Task.user_id == template.user_id,
            Task.deadline.isnot(None),
            Task.deadline > end_date
        )
        .all()
    )
    
    count = len(instances_to_delete)
    for instance in instances_to_delete:
        db.delete(instance)
    
    if count > 0:
        db.commit()
    
    return count
