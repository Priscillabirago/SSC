from datetime import date, datetime, timedelta, timezone
import json
import logging
import re
from typing import Any
from sqlalchemy import inspect

from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlalchemy.orm import Session

from app.api import deps
from app.coach.factory import get_coach_adapter
from app.db.session import get_db
from app.models.user import User
from app.models.coach_message import CoachMessage
from app.models.study_session import StudySession, SessionStatus
from app.models.task import Task
from app.models.daily_energy import DailyEnergy
from app.models.daily_reflection import DailyReflection

logger = logging.getLogger(__name__)
from app.schemas.coach import (
    CoachChatRequest,
    CoachChatResponse,
    CoachMicroPlanRequest,
    CoachMicroPlanResponse,
    CoachPlanSuggestion,
    CoachReflectionRequest,
    CoachReflectionResponse,
    CoachMessageCreate,
    CoachMessagePublic,
    DailySummaryResponse,
    SessionEncouragementRequest,
    SessionEncouragementResponse,
)
from app.services import coach as coach_service
from app.services.scheduling import micro_plan

router = APIRouter()


@router.post("/chat", response_model=CoachChatResponse)
def coach_chat(
    payload: CoachChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> CoachChatResponse:
    adapter = get_coach_adapter()
    context = coach_service.build_coach_context(db, current_user)
    response = adapter.chat(current_user, payload.message, context)
    reply = response.get("reply", "Let's keep making progress!")
    cleaned_reply, memory_payloads = _extract_memory_blocks(reply)
    
    # Also remove any markdown formatting that might have slipped through
    # Remove markdown headers (###, ##, #)
    cleaned_reply = re.sub(r'^#{1,6}\s+', '', cleaned_reply, flags=re.MULTILINE)
    # Remove bold/italic markdown (**text**, *text*)
    cleaned_reply = re.sub(r'\*\*([^*]+)\*\*', r'\1', cleaned_reply)
    cleaned_reply = re.sub(r'\*([^*]+)\*', r'\1', cleaned_reply)
    # Remove markdown list markers at start of lines (-, *, •)
    cleaned_reply = re.sub(r'^[\s]*[-*•]\s+', '', cleaned_reply, flags=re.MULTILINE)
    # Clean up extra whitespace
    cleaned_reply = re.sub(r'\n{3,}', '\n\n', cleaned_reply)
    cleaned_reply = cleaned_reply.strip()
    
    coach_service.log_memory(
        db,
        user_id=current_user.id,
        topic="chat",
        content=f"User: {payload.message}\nCoach: {cleaned_reply}",
        source="chat",
    )
    for memory in memory_payloads:
        memory_type = memory.get("type")
        content = memory.get("content")
        if memory_type in {"action_item", "question"} and content:
            coach_service.log_memory(
                db,
                user_id=current_user.id,
                topic=memory_type,
                content=json.dumps(memory),
                source="chat",
            )
    return CoachChatResponse(
        reply=cleaned_reply,  # Use cleaned reply without memory blocks and markdown
        follow_up=response.get("follow_up"),
        plan_adjusted=response.get("plan_adjusted", False),
    )


@router.post("/suggest-plan", response_model=CoachPlanSuggestion)
def coach_suggest_plan(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> CoachPlanSuggestion:
    adapter = get_coach_adapter()
    context = coach_service.build_coach_context(db, current_user)
    response = adapter.suggest_plan(current_user, context)
    reply = response.get("reply", "")
    
    # Clean markdown from reply
    cleaned_reply = reply
    if cleaned_reply:
        # Remove markdown headers (###, ##, #)
        cleaned_reply = re.sub(r'^#{1,6}\s+', '', cleaned_reply, flags=re.MULTILINE)
        # Remove bold/italic markdown (**text**, *text*)
        cleaned_reply = re.sub(r'\*\*([^*]+)\*\*', r'\1', cleaned_reply)
        cleaned_reply = re.sub(r'\*([^*]+)\*', r'\1', cleaned_reply)
        # Remove markdown list markers at start of lines (-, *, •)
        cleaned_reply = re.sub(r'^[\s]*[-*•]\s+', '', cleaned_reply, flags=re.MULTILINE)
        # Clean up extra whitespace
        cleaned_reply = re.sub(r'\n{3,}', '\n\n', cleaned_reply)
        cleaned_reply = cleaned_reply.strip()
    
    highlights = response.get("highlights") or []
    # Only use auto-generated highlights if AI provided them
    # Don't duplicate the summary as highlights
    suggestion = CoachPlanSuggestion(
        summary=cleaned_reply or "Stay consistent with your plan.",
        highlights=highlights,
        action_items=response.get("action_items", []),
    )
    coach_service.log_memory(
        db,
        user_id=current_user.id,
        topic="plan_suggestion",
        content=suggestion.summary,
        source="plan",
    )
    return suggestion


@router.post("/micro-plan", response_model=CoachMicroPlanResponse)
def coach_micro_plan(
    payload: CoachMicroPlanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> CoachMicroPlanResponse:
    if payload.minutes < 15:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Micro planning requires at least 15 minutes.",
        )
    adapter = get_coach_adapter()
    context = coach_service.build_coach_context(db, current_user)
    ai_response = adapter.micro_plan(current_user, payload.minutes, context)
    schedule_blocks = micro_plan(db, current_user, payload.minutes)
    slots = [
        f"{block.start_time.strftime('%H:%M')}–{block.end_time.strftime('%H:%M')}: {block.focus}"
        for block in schedule_blocks
    ]
    rationale = ai_response.get("reply") or "\n".join(slots) or "Focus on a single priority task."
    coach_service.log_memory(
        db,
        user_id=current_user.id,
        topic="micro_plan",
        content=rationale,
        source="micro",
    )
    return CoachMicroPlanResponse(slots=slots, rationale=rationale)


@router.post("/reflect", response_model=CoachReflectionResponse)
def coach_reflect(
    payload: CoachReflectionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> CoachReflectionResponse:
    adapter = get_coach_adapter()
    context = coach_service.build_coach_context(db, current_user)
    response = adapter.reflect_day(current_user, payload.worked, payload.challenging, context)
    summary = response.get("summary", "")
    suggestion = response.get("suggestion", "Reset for tomorrow with one clear objective.")
    # Get today in user's timezone
    from zoneinfo import ZoneInfo
    from datetime import datetime
    try:
        tz = ZoneInfo(current_user.timezone)
    except Exception:
        tz = ZoneInfo("UTC")
    today = datetime.now(tz).date()
    
    coach_service.record_reflection(
        db,
        user_id=current_user.id,
        day=today,
        worked=payload.worked,
        challenging=payload.challenging,
        summary=summary,
        suggestion=suggestion,
    )
    coach_service.log_memory(
        db,
        user_id=current_user.id,
        topic="reflection",
        content=summary or suggestion,
        source="reflection",
    )
    return CoachReflectionResponse(
        summary=summary,
        blockers=[payload.challenging],
        suggestion=suggestion,
    )


@router.get("/daily-summary", response_model=DailySummaryResponse)
def get_daily_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> DailySummaryResponse:
    """Generate or retrieve automatic end-of-day summary.
    
    Returns summary for yesterday (to show in morning before first session)
    or today (to show after last session ends).
    Also returns session timing info for frontend to determine when to show.
    """
    from zoneinfo import ZoneInfo
    
    # Get current time in user's timezone
    try:
        tz = ZoneInfo(current_user.timezone)
    except Exception:
        tz = ZoneInfo("UTC")
    now_local = datetime.now(tz)
    now_utc = datetime.now(timezone.utc)
    today = now_local.date()
    today_start_local = datetime.combine(today, datetime.min.time()).replace(tzinfo=tz)
    today_end_local = today_start_local + timedelta(days=1)
    today_end_utc = today_end_local.astimezone(timezone.utc)
    
    # Get first upcoming session for today (to determine if we should show yesterday's summary)
    first_upcoming_session = (
        db.query(StudySession)
        .filter(
            StudySession.user_id == current_user.id,
            StudySession.start_time >= now_utc,
            StudySession.start_time < today_end_utc,
        )
        .order_by(StudySession.start_time.asc())
        .first()
    )
    first_session_start = first_upcoming_session.start_time.isoformat() if first_upcoming_session else None
    
    # Determine which day to summarize
    # If it's morning and we have a first session, show yesterday's summary
    # Otherwise, show today's summary (for after last session)
    if now_local.hour < 12 and first_session_start:
        target_day = (now_local - timedelta(days=1)).date()
    else:
        target_day = today
    
    target_day_start_local = datetime.combine(target_day, datetime.min.time()).replace(tzinfo=tz)
    target_day_end_local = target_day_start_local + timedelta(days=1)
    target_day_start_utc = target_day_start_local.astimezone(timezone.utc)
    target_day_end_utc = target_day_end_local.astimezone(timezone.utc)
    
    # Get last completed session for target_day (the day we're summarizing)
    last_completed_session = (
        db.query(StudySession)
        .filter(
            StudySession.user_id == current_user.id,
            StudySession.status.in_([SessionStatus.COMPLETED, SessionStatus.PARTIAL]),
            StudySession.start_time >= target_day_start_utc,
            StudySession.start_time < target_day_end_utc,
        )
        .order_by(StudySession.end_time.desc())
        .first()
    )
    last_session_end = last_completed_session.end_time.isoformat() if last_completed_session and last_completed_session.end_time else None
    
    # Check if we already have an auto-generated summary for target day
    existing_reflection = (
        db.query(DailyReflection)
        .filter(
            DailyReflection.user_id == current_user.id,
            DailyReflection.day == target_day,
            DailyReflection.worked.is_(None),  # Auto-generated if worked is null
            DailyReflection.challenging.is_(None)  # Auto-generated if challenging is null
        )
        .first()
    )
    
    if existing_reflection and existing_reflection.summary:
        # Return existing summary with session timing
        return DailySummaryResponse(
            summary=existing_reflection.summary,
            tomorrow_tip=existing_reflection.suggestion or "",
            tone="positive",
            last_session_end=last_session_end,
            first_session_start=first_session_start,
            user_timezone=current_user.timezone or "UTC"
        )
    
    # Build daily context for target day
    completed_sessions = (
        db.query(StudySession)
        .filter(
            StudySession.user_id == current_user.id,
            StudySession.status.in_([SessionStatus.COMPLETED, SessionStatus.PARTIAL]),
            StudySession.start_time >= target_day_start_utc,
            StudySession.start_time < target_day_end_utc,
        )
        .all()
    )
    
    completed_tasks = (
        db.query(Task)
        .filter(
            Task.user_id == current_user.id,
            Task.is_completed.is_(True),
            Task.completed_at >= target_day_start_utc,
            Task.completed_at < target_day_end_utc,
        )
        .all()
    )
    
    # Calculate total minutes
    total_minutes = sum(
        int((session.end_time - session.start_time).total_seconds() // 60)
        for session in completed_sessions
    )
    
    # Get target day's energy
    energy_target_day = (
        db.query(DailyEnergy)
        .filter(DailyEnergy.user_id == current_user.id, DailyEnergy.day == target_day)
        .first()
    )
    energy_level = energy_target_day.level if energy_target_day else "medium"
    
    # Get tasks due the day after target day
    next_day_start_local = target_day_end_local
    next_day_end_local = next_day_start_local + timedelta(days=1)
    next_day_start_utc = next_day_start_local.astimezone(timezone.utc)
    next_day_end_utc = next_day_end_local.astimezone(timezone.utc)
    
    tasks_next_day = (
        db.query(Task)
        .filter(
            Task.user_id == current_user.id,
            Task.is_completed.is_(False),
            Task.deadline.isnot(None),
            Task.deadline >= next_day_start_utc,
            Task.deadline < next_day_end_utc,
        )
        .all()
    )
    
    # Build daily context
    daily_context = {
        "completed_sessions": completed_sessions,
        "completed_tasks": completed_tasks,
        "total_minutes": total_minutes,
        "energy_level": energy_level,
        "tasks_tomorrow": tasks_next_day,
    }
    
    # Generate summary using AI
    adapter = get_coach_adapter()
    user_context = coach_service.build_coach_context(db, current_user)
    ai_response = adapter.generate_daily_summary(current_user, daily_context, user_context)
    
    summary = ai_response.get("summary", "")
    tomorrow_tip = ai_response.get("tomorrow_tip", "")
    tone = ai_response.get("tone", "positive")
    
    # Store in DailyReflection (with worked/challenging as None to indicate auto-generated)
    coach_service.record_reflection(
        db,
        user_id=current_user.id,
        day=target_day,
        worked=None,  # None indicates auto-generated
        challenging=None,  # None indicates auto-generated
        summary=summary,
        suggestion=tomorrow_tip,
    )
    
    return DailySummaryResponse(
        summary=summary,
        tomorrow_tip=tomorrow_tip,
        tone=tone,
        last_session_end=last_session_end,
        first_session_start=first_session_start,
        user_timezone=current_user.timezone or "UTC"
    )


def to_dt(value):
    if isinstance(value, str):
        try:
            # Accept both ISO8601 with T and with space
            return datetime.fromisoformat(value.replace("T", " "))
        except Exception as e:
            logger.warning(f"Failed to parse datetime: {value} - {e}")
            return None
    return value

def fuzzy_find(tasks, subjects, focus):
    f = focus.lower()
    for t in tasks:
        if t.title.lower() == f: return (t.id, None)
    for s in subjects:
        if s.name.lower() == f: return (None, s.id)
    matched_tasks = [t for t in tasks if f in t.title.lower() or t.title.lower() in f]
    matched_subjects = [s for s in subjects if f in s.name.lower() or s.name.lower() in f]
    if len(matched_tasks) == 1 and not matched_subjects:
        return (matched_tasks[0].id, None)
    if len(matched_subjects) == 1 and not matched_tasks:
        return (None, matched_subjects[0].id)
    if len(matched_tasks) + len(matched_subjects) > 1:
        logger.warning(f"Ambiguous focus '{focus}'. Matches: tasks={[t.title for t in matched_tasks]}, subjects={[s.name for s in matched_subjects]}")
        return "ambiguous", "ambiguous"
    return None, None

def handle_task_add(details, db, current_user, task_model):
    task_kwargs = {k: v for k, v in details.items() if k != "id"}
    task = task_model(user_id=current_user.id, **task_kwargs)
    db.add(task)
    db.commit()
    db.refresh(task)
    logger.info(f"Task added: {task.id} | {task.title}")
    return {"success": True, "id": task.id}

def handle_task_edit(details, db, current_user, task_model):
    task_id = details.get("id")
    if not task_id:
        return {"success": False, "error": "You must specify a task ID to edit it."}
    task = db.query(task_model).filter(task_model.id==task_id, task_model.user_id==current_user.id).first()
    if not task:
        logger.warning(f"Task not found for edit: task_id={task_id}, user_id={current_user.id}")
        return {"success": False, "error": "Task not found."}
    for k, v in details.items():
        if k != "id" and hasattr(task, k):
            if k == "deadline" and v is not None:
                v = to_dt(v)
            setattr(task, k, v)
    db.add(task)
    db.commit()
    db.refresh(task)
    logger.info(f"Task edited: {task.id}")
    return {"success": True, "id": task.id}

def handle_task_delete(details, db, current_user, task_model):
    task_id = details.get("id")
    task = db.query(task_model).filter(task_model.id==task_id, task_model.user_id==current_user.id).first()
    if not task:
        logger.warning(f"Task not found for delete: task_id={task_id}, user_id={current_user.id}")
        return {"success": False, "error": "Task not found."}
    db.delete(task)
    db.commit()
    logger.info(f"Task deleted: {task_id}")
    return {"success": True}

def handle_schedule_add(details, db, current_user, study_session_model, subject_model, task_model):
    session_kwargs = {k: v for k, v in details.items() if k != "id"}
    for k in ["start_time", "end_time"]:
        if k in session_kwargs:
            session_kwargs[k] = to_dt(session_kwargs[k])
            if session_kwargs[k] is None:
                return {"success": False, "error": f"Could not parse {k} value: {details.get(k)}. Please use a valid date/time."}
    focus = session_kwargs.pop("focus", None) or session_kwargs.pop("title", None)
    task_id = subject_id = None
    all_tasks = db.query(task_model).filter(task_model.user_id == current_user.id).all()
    all_subjects = db.query(subject_model).filter(subject_model.user_id == current_user.id).all()
    if focus:
        match = fuzzy_find(all_tasks, all_subjects, focus)
        if match == ("ambiguous", "ambiguous"):
            return {"success": False, "error": "Your request matches more than one subject or task. Please specify the exact name or clarify."}
        elif match == (None, None):
            task_id, subject_id = None, None
            session_kwargs["notes"] = focus
            study_session_class = study_session_model
            table_cols = {c.key for c in inspect(study_session_class).c}
            if "notes" not in table_cols:
                session_kwargs.pop("notes", None)
        else:
            task_id, subject_id = match
    session = study_session_model(
        user_id=current_user.id,
        task_id=task_id,
        subject_id=subject_id,
        **session_kwargs
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    logger.info(f"StudySession added: {session.id}")
    return {"success": True, "id": session.id}

def handle_schedule_edit(details, db, current_user, study_session_model):
    session_id = details.get("id")
    session = db.query(study_session_model).filter(study_session_model.id==session_id, study_session_model.user_id==current_user.id).first()
    if not session: 
        logger.warning(f"Session not found for edit: session_id={session_id}, user_id={current_user.id}")
        return {"success": False, "error": "Session not found."}
    for k,v in details.items():
        if k != "id" and hasattr(session, k): 
            setattr(session, k, v)
    db.add(session)
    db.commit()
    db.refresh(session)
    logger.info(f"StudySession edited: {session.id}")
    return {"success": True, "id": session.id}

def handle_schedule_delete(details, db, current_user, study_session_model):
    session_id = details.get("id")
    session = db.query(study_session_model).filter(study_session_model.id==session_id, study_session_model.user_id==current_user.id).first()
    if not session:
        logger.warning(f"Session not found for delete: session_id={session_id}, user_id={current_user.id}")
        return {"success": False, "error": "Session not found."}
    db.delete(session)
    db.commit()
    logger.info(f"StudySession deleted: {session_id}")
    return {"success": True}

@router.post("/apply-proposal")
def apply_coach_proposal(
    proposal: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    supported_types = {"schedule_change", "task_update"}
    supported_actions = {"add", "edit", "delete"}
    typ = proposal.get("type")
    action = proposal.get("action")
    details = proposal.get("details") or {}
    if typ not in supported_types or action not in supported_actions:
        return {"success": False, "error": "Unsupported proposal type or action."}
    try:
        if typ == "task_update":
            from app.models.task import Task as task_model
            if action == "add":
                return handle_task_add(details, db, current_user, task_model)
            elif action == "edit":
                return handle_task_edit(details, db, current_user, task_model)
            elif action == "delete":
                return handle_task_delete(details, db, current_user, task_model)
        elif typ == "schedule_change":
            from app.models.study_session import StudySession as study_session_model
            from app.models.subject import Subject as subject_model
            from app.models.task import Task as task_model
            if action == "add":
                return handle_schedule_add(details, db, current_user, study_session_model, subject_model, task_model)
            elif action == "edit":
                return handle_schedule_edit(details, db, current_user, study_session_model)
            elif action == "delete":
                return handle_schedule_delete(details, db, current_user, study_session_model)
        return {"success": False, "error": "Not implemented for type/action"}
    except HTTPException as e:
        db.rollback()
        return {"success": False, "error": e.detail}
    except ValueError as e:
        db.rollback()
        return {"success": False, "error": str(e)}
    except Exception as e:
        db.rollback()
        logger.error(f"Error applying coach proposal: {e}")
        return {"success": False, "error": "An unexpected error occurred"}


@router.get("/chat/history", response_model=list[CoachMessagePublic])
def get_chat_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    msgs = (
        db.query(CoachMessage)
        .filter(CoachMessage.user_id == current_user.id)
        .order_by(CoachMessage.created_at.asc(), CoachMessage.id.asc())
        .limit(50)
        .all()
    )
    return msgs

@router.post("/chat/history", response_model=CoachMessagePublic)
def post_chat_message(
    msg: CoachMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    coach_msg = CoachMessage(
        user_id = current_user.id,
        **msg.dict()
    )
    db.add(coach_msg)
    db.commit()
    db.refresh(coach_msg)
    return coach_msg

@router.delete("/chat/history/{message_id}", status_code=204)
def delete_chat_message(message_id: int, db: Session = Depends(get_db), current_user: User = Depends(deps.get_current_user)):
    msg = db.query(CoachMessage).filter(CoachMessage.user_id == current_user.id, CoachMessage.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found.")
    db.delete(msg)
    db.commit()
    return None

@router.delete("/chat/history", status_code=204)
def delete_all_chat_history(db: Session = Depends(get_db), current_user: User = Depends(deps.get_current_user)):
    db.query(CoachMessage).filter(CoachMessage.user_id == current_user.id).delete()
    db.commit()
    return None


@router.post("/session-encouragement", response_model=SessionEncouragementResponse)
def get_session_encouragement(
    payload: SessionEncouragementRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> SessionEncouragementResponse:
    """Generate encouraging, motivational messages during a focus session."""
    adapter = get_coach_adapter()
    user_context = coach_service.build_coach_context(db, current_user)
    
    session_context = {
        "elapsed_minutes": payload.elapsed_minutes,
        "remaining_minutes": payload.remaining_minutes,
        "progress_percent": payload.progress_percent,
        "task_title": payload.task_title or "your work",
        "is_paused": payload.is_paused,
        "pomodoro_count": payload.pomodoro_count,
    }
    
    ai_response = adapter.get_session_encouragement(current_user, session_context, user_context)
    
    return SessionEncouragementResponse(
        message=ai_response.get("message", "Stay focused! You're making progress."),
        tone=ai_response.get("tone", "supportive")
    )


MEMORY_BLOCK_PATTERN = re.compile(r"<<memory:(.*?)>>", re.DOTALL)


def _extract_memory_blocks(reply: str) -> tuple[str, list[dict[str, Any]]]:
    memories: list[dict[str, Any]] = []

    def _replace(match: re.Match[str]) -> str:
        block = match.group(1).strip()
        try:
            data = json.loads(block)
            if isinstance(data, dict):
                memories.append(data)
        except json.JSONDecodeError:
            pass
        return ""

    cleaned = MEMORY_BLOCK_PATTERN.sub(_replace, reply)
    return cleaned.strip(), memories

