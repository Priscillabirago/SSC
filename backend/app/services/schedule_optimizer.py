"""Safe schedule optimization using AI suggestions."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.schemas.schedule import DailyPlan, StudyBlock, WeeklyPlan


def _build_schedule_summary(plan: WeeklyPlan) -> str:
    """Build a text summary of the schedule for AI review with workload metrics."""
    lines = []
    daily_hours = []
    
    for day_plan in plan.days:
        day_name = day_plan.day.strftime("%A, %B %d")
        total_minutes = sum(
            int((block.end_time - block.start_time).total_seconds() // 60)
            for block in day_plan.sessions
        )
        total_hours = total_minutes / 60
        daily_hours.append(total_hours)
        
        lines.append(f"{day_name}: {len(day_plan.sessions)} sessions, {total_hours:.1f}h total")
        for i, block in enumerate(day_plan.sessions):
            time_str = block.start_time.strftime("%H:%M")
            duration = int((block.end_time - block.start_time).total_seconds() // 60)
            lines.append(f"  {i}. {time_str} ({duration}min): {block.focus}")
    
    # Add workload distribution analysis
    if daily_hours:
        avg_hours = sum(daily_hours) / len(daily_hours)
        max_hours = max(daily_hours)
        min_hours = min(daily_hours)
        imbalance = max_hours - min_hours
        
        lines.append("\nWorkload Analysis:")
        lines.append(f"- Average: {avg_hours:.1f}h/day")
        lines.append(f"- Range: {min_hours:.1f}h (min) to {max_hours:.1f}h (max)")
        lines.append(f"- Imbalance: {imbalance:.1f}h difference")
        if imbalance > 2:
            lines.append("⚠️ Significant workload imbalance detected!")
    
    return "\n".join(lines)


def _build_tasks_summary(tasks: list[Any], subjects: dict[int, Any]) -> str:
    """Build a summary of tasks for AI context."""
    lines = []
    for task in tasks[:20]:  # Limit to 20 tasks
        subject_name = subjects.get(task.subject_id, {}).get("name", "General") if task.subject_id else "General"
        priority = getattr(task, "priority", "medium")
        deadline = getattr(task, "deadline", None)
        estimated = getattr(task, "estimated_minutes", 60)
        deadline_str = f" (deadline: {deadline.strftime('%Y-%m-%d')})" if deadline else ""
        lines.append(f"- {task.title} ({subject_name}, {priority} priority, {estimated}min{deadline_str})")
    return "\n".join(lines) if lines else "No tasks"


def _build_constraints_summary(constraints: list[Any]) -> str:
    """Build a summary of constraints."""
    if not constraints:
        return "No constraints"
    lines = []
    for constraint in constraints[:10]:  # Limit to 10 constraints
        constraint_type = getattr(constraint, "constraint_type", "unavailable")
        start = getattr(constraint, "start_time", None)
        end = getattr(constraint, "end_time", None)
        if start and end:
            lines.append(f"- {constraint_type}: {start.strftime('%H:%M')} - {end.strftime('%H:%M')}")
    return "\n".join(lines) if lines else "No constraints"


def _build_historical_patterns(
    db: Session, user_id: int, days_back: int = 30
) -> dict[str, Any]:
    """Build historical pattern analysis for AI context."""
    from datetime import date, timedelta
    from app.models.study_session import StudySession, SessionStatus
    
    cutoff = datetime.now(timezone.utc) - timedelta(days=days_back)
    
    # Get historical sessions
    historical_sessions = (
        db.query(StudySession)
        .filter(
            StudySession.user_id == user_id,
            StudySession.start_time >= cutoff,
        )
        .all()
    )
    
    if not historical_sessions:
        return {"patterns": "No historical data available yet"}
    
    # Calculate patterns
    total_sessions = len(historical_sessions)
    completed_sessions = len([s for s in historical_sessions if s.status == SessionStatus.COMPLETED])
    overall_adherence = completed_sessions / total_sessions if total_sessions > 0 else 0.0
    
    # Day-of-week patterns
    day_completion: dict[str, list[bool]] = defaultdict(list)
    for session in historical_sessions:
        day_name = session.start_time.strftime("%A")
        day_completion[day_name].append(session.status == SessionStatus.COMPLETED)
    
    day_patterns = {}
    for day, completions in day_completion.items():
        if completions:
            day_patterns[day] = {
                "completion_rate": sum(completions) / len(completions),
                "total_sessions": len(completions)
            }
    
    # Time-of-day patterns (when user actually completes sessions)
    completed_times = [
        session.start_time.hour
        for session in historical_sessions
        if session.status == SessionStatus.COMPLETED
    ]
    most_productive_hour = None
    if completed_times:
        from collections import Counter
        hour_counts = Counter(completed_times)
        most_productive_hour = hour_counts.most_common(1)[0][0]
    
    # Average session duration for completed sessions
    completed_durations = [
        int((s.end_time - s.start_time).total_seconds() // 60)
        for s in historical_sessions
        if s.status == SessionStatus.COMPLETED
    ]
    avg_duration = sum(completed_durations) / len(completed_durations) if completed_durations else 0
    
    return {
        "overall_adherence": round(overall_adherence, 2),
        "total_sessions_analyzed": total_sessions,
        "day_patterns": day_patterns,
        "most_productive_hour": most_productive_hour,
        "average_completed_duration_minutes": round(avg_duration, 0),
        "patterns_summary": f"Historical analysis: {overall_adherence:.0%} adherence over {days_back} days. "
                           f"{f'Most productive at {most_productive_hour}:00' if most_productive_hour else ''}"
    }


def build_schedule_context(
    plan: WeeklyPlan,
    tasks: list[Any],
    subjects: list[Any],
    constraints: list[Any],
    db: Session | None = None,
    user_id: int | None = None,
) -> dict[str, Any]:
    """Build context dictionary for AI schedule optimization."""
    subject_map = {s.id: {"name": s.name, "difficulty": getattr(s, "difficulty", "medium")} for s in subjects}
    
    context = {
        "schedule_summary": _build_schedule_summary(plan),
        "tasks_summary": _build_tasks_summary(tasks, subject_map),
        "constraints_summary": _build_constraints_summary(constraints),
    }
    
    # Add historical patterns if available
    if db and user_id:
        historical_patterns = _build_historical_patterns(db, user_id)
        context["historical_patterns"] = historical_patterns
    
    return context


def apply_ai_optimizations(
    base_plan: WeeklyPlan,
    ai_suggestions: dict[str, Any],
    user_preferences: dict[str, Any] | None = None,  # Reserved for future use
) -> tuple[WeeklyPlan, str]:
    # user_preferences reserved for future optimization logic
    """
    Safely apply AI optimization suggestions to a schedule.
    
    Returns:
        tuple: (optimized_plan, explanation)
        - optimized_plan: The schedule with safe optimizations applied
        - explanation: Human-readable explanation of what changed
    """
    optimizations = ai_suggestions.get("optimizations", [])
    base_explanation = ai_suggestions.get("explanation", "Schedule reviewed and optimized.")
    
    # Start with base plan
    optimized_days = []
    changes_applied = []
    
    # Apply safe optimizations (buffer time, etc.)
    for opt in optimizations:
        opt_type = opt.get("type")
        suggested_changes = opt.get("suggested_changes", {})
        
        # Apply buffer time if suggested (safe optimization)
        if opt_type == "buffer_time" and suggested_changes.get("add_buffer_before"):
            # This would require session modification - for now, just note it
            changes_applied.append("Buffer time recommendations noted")
        
        # Other optimizations require more complex logic (session movement, etc.)
        # For now, we document them but don't auto-apply to avoid breaking constraints
    
    # Copy all days (for now, structural changes are informational)
    for day_plan in base_plan.days:
        optimized_days.append(DailyPlan(
            day=day_plan.day,
            sessions=day_plan.sessions.copy()
        ))
    
    optimized_plan = WeeklyPlan(
        user_id=base_plan.user_id,
        generated_at=base_plan.generated_at,
        days=optimized_days,
        optimization_explanation=None  # Will be set by the endpoint
    )
    
    # Enhance explanation with specific details from optimizations
    if optimizations:
        # Build detailed explanation from optimization descriptions
        optimization_details = []
        for opt in optimizations:
            day_info = f" ({opt.get('day')})" if opt.get('day') else ""
            optimization_details.append(f"• {opt.get('description', 'Optimization')}{day_info}")
        
        if optimization_details:
            explanation = f"{base_explanation}\n\nKey optimizations identified:\n" + "\n".join(optimization_details[:5])  # Limit to 5
        else:
            explanation = base_explanation
    else:
        # No optimizations - use the base explanation (which should be specific per new prompt)
        explanation = base_explanation
    
    return optimized_plan, explanation

