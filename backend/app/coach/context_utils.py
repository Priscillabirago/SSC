from __future__ import annotations

from typing import Any


def build_context_lines(context: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    
    # Use detailed tasks if available, otherwise fall back to simple titles
    active_tasks_detailed = context.get("active_tasks_detailed", [])
    if active_tasks_detailed:
        # Build comprehensive task list with deadlines and priorities
        task_entries = []
        urgent_tasks = []
        for task in active_tasks_detailed[:15]:  # Limit to 15 most important
            if not isinstance(task, dict):
                continue
            title = task.get("title", "")
            deadline = task.get("deadline")
            priority = task.get("priority", "medium")
            subject = task.get("subject")
            estimated = task.get("estimated_minutes")
            
            # Build task description
            parts = [title]
            if subject:
                parts.append(f"({subject})")
            if priority and priority != "medium":
                parts.append(f"[{priority} priority]")
            if deadline:
                try:
                    from datetime import datetime
                    deadline_dt = datetime.fromisoformat(deadline.replace('Z', '+00:00') if 'Z' in deadline else deadline)
                    now = datetime.now(deadline_dt.tzinfo) if deadline_dt.tzinfo else datetime.now()
                    days_until = (deadline_dt.date() - now.date()).days
                    if days_until < 0:
                        parts.append(f"[OVERDUE by {abs(days_until)} days]")
                    elif days_until == 0:
                        parts.append("[due TODAY]")
                    elif days_until <= 3:
                        parts.append(f"[due in {days_until} days]")
                    else:
                        parts.append(f"[due {deadline_dt.strftime('%Y-%m-%d')}]")
                except Exception:
                    parts.append(f"[deadline: {deadline[:10]}]")
            if estimated:
                hours = estimated / 60
                parts.append(f"({hours:.1f}h)")
            
            task_entry = " ".join(parts)
            task_entries.append(task_entry)
            
            if priority == "critical" or (deadline and "OVERDUE" in task_entry or "due TODAY" in task_entry):
                urgent_tasks.append(title)
        
        if task_entries:
            lines.append("Active tasks with details: " + "; ".join(task_entries))
        if urgent_tasks:
            lines.append(f"⚠️ Urgent/Critical tasks: {', '.join(urgent_tasks)}")
    else:
        # Fallback to simple task titles
        active_tasks = context.get("active_tasks", [])
        urgent_tasks = []
        if active_tasks:
            for t in active_tasks:
                if isinstance(t, dict):
                    if t.get("priority") == "critical":
                        urgent_tasks.append(t["title"])
                elif isinstance(t, str) and "critical" in t.lower():
                    urgent_tasks.append(t)
        if urgent_tasks:
            lines.append(f"Urgent tasks: {', '.join(urgent_tasks)}")
        lines.append(f"Outstanding tasks: {context.get('active_tasks_count', 0)}")
    
    # Existing: energy and counts
    energy = context.get("energy")
    if energy:
        lines.append(f"Today's energy: {energy}")

    completed_tasks = _summarize_completed_tasks(context.get("completed_tasks_today"))
    if completed_tasks:
        lines.append(completed_tasks)

    session_summary = _summarize_sessions(context.get("completed_sessions_today"))
    if session_summary:
        lines.append(session_summary)

    due_tomorrow = _summarize_due_tasks(context.get("tasks_due_tomorrow"))
    if due_tomorrow:
        lines.append(due_tomorrow)

    reflection_summary = _summarize_reflection(context.get("recent_reflection"))
    if reflection_summary:
        lines.append(reflection_summary)

    upcoming_sessions = _summarize_upcoming_sessions(context.get("upcoming_sessions"))
    if upcoming_sessions:
        lines.append(upcoming_sessions)

    action_lines = _summarize_action_items(context.get("action_items"))
    if action_lines:
        lines.append(action_lines)

    question_lines = _summarize_questions(context.get("open_questions"))
    if question_lines:
        lines.append(question_lines)

    return lines


def _summarize_completed_tasks(tasks: Any) -> str | None:
    if not tasks:
        return None
    titles = [
        task.get("title")
        for task in tasks[:5]
        if isinstance(task, dict) and task.get("title")
    ]
    if not titles:
        return None
    return "Completed today: " + "; ".join(titles)


def _summarize_sessions(sessions: Any) -> str | None:
    if not sessions:
        return None
    entries: list[str] = []
    for session in sessions[:5]:
        if not isinstance(session, dict):
            continue
        label_parts: list[str] = []
        task_name = session.get("task")
        subject_name = session.get("subject")
        if task_name:
            label_parts.append(task_name)
        if subject_name:
            label_parts.append(subject_name)
        status = session.get("status") or "planned"
        label = " / ".join(label_parts) if label_parts else "Session"
        # Clarify that these are completed SESSIONS, not completed tasks
        entries.append(f"{label} (session {status})")
    if not entries:
        return None
    return "Completed sessions today (work done, tasks may still be in progress): " + "; ".join(entries)


def _summarize_due_tasks(tasks: Any) -> str | None:
    if not tasks:
        return None
    entries: list[str] = []
    for task in tasks[:5]:
        if not isinstance(task, dict):
            continue
        title = task.get("title")
        if not title:
            continue
        priority = task.get("priority")
        if priority:
            entries.append(f"{title} ({priority})")
        else:
            entries.append(title)
    if not entries:
        return None
    return "Due tomorrow: " + "; ".join(entries)


def _summarize_reflection(reflection: Any) -> str | None:
    if not isinstance(reflection, dict):
        return None
    parts: list[str] = []
    summary = reflection.get("summary")
    suggestion = reflection.get("suggestion")
    if summary:
        parts.append(summary)
    if suggestion:
        parts.append(f"Tip: {suggestion}")
    if not parts:
        return None
    return "Latest reflection: " + " | ".join(parts)


def _summarize_upcoming_sessions(sessions: Any) -> str | None:
    if not sessions:
        return None
    entries: list[str] = []
    for session in sessions[:3]:
        if not isinstance(session, dict):
            continue
        status = session.get("status")
        focus = session.get("focus")
        start = session.get("start")
        pieces = []
        if focus:
            pieces.append(str(focus))
        if status:
            pieces.append(str(status))
        if start:
            pieces.append(start)
        if pieces:
            entries.append(" / ".join(pieces))
    if not entries:
        return None
    return "Upcoming sessions: " + "; ".join(entries)


def _summarize_action_items(items: Any) -> str | None:
    if not items:
        return None
    entries: list[str] = []
    for item in items[:5]:
        if not isinstance(item, dict):
            continue
        content = item.get("content") or ""
        related = item.get("related_task")
        if related:
            entries.append(f"{content} ({related})")
        elif content:
            entries.append(content)
    if not entries:
        return None
    return "Action items: " + "; ".join(entries)


def _summarize_questions(items: Any) -> str | None:
    if not items:
        return None
    entries: list[str] = []
    for item in items[:5]:
        if not isinstance(item, dict):
            continue
        content = item.get("content") or ""
        if content:
            entries.append(content)
    if not entries:
        return None
    return "Open questions: " + "; ".join(entries)

