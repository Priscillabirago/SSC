from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import logging

from app.api import deps
from app.coach.factory import get_coach_adapter
from app.db.session import get_db
from app.models.task import Task, TaskStatus
from app.models.user import User
from app.schemas.task import Subtask, TaskCreate, TaskPublic, TaskUpdate
from app.services import coach as coach_service
from app.services import recurring_tasks

logger = logging.getLogger(__name__)

router = APIRouter()


def _get_task_or_404(db: Session, task_id: int, user: User) -> Task:
    task = db.query(Task).filter(Task.id == task_id, Task.user_id == user.id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )
    return task


def _serialize_task(task: Task) -> TaskPublic:
    """Serialize task with computed total_minutes_spent.
    
    Ensures datetime fields (deadline, recurrence_end_date, next_occurrence_date)
    are timezone-aware (UTC) for proper JSON serialization.
    """
    from datetime import timezone
    
    task_dict = task.__dict__.copy()
    # Remove SQLAlchemy internal attributes
    task_dict.pop('_sa_instance_state', None)
    
    # Ensure datetime fields are timezone-aware (UTC)
    # Tasks are stored as naive UTC, so we need to make them aware
    if task.deadline and task.deadline.tzinfo is None:
        task_dict['deadline'] = task.deadline.replace(tzinfo=timezone.utc)
    if task.recurrence_end_date and task.recurrence_end_date.tzinfo is None:
        task_dict['recurrence_end_date'] = task.recurrence_end_date.replace(tzinfo=timezone.utc)
    if task.next_occurrence_date and task.next_occurrence_date.tzinfo is None:
        task_dict['next_occurrence_date'] = task.next_occurrence_date.replace(tzinfo=timezone.utc)
    if task.created_at and task.created_at.tzinfo is None:
        task_dict['created_at'] = task.created_at.replace(tzinfo=timezone.utc)
    if task.updated_at and task.updated_at.tzinfo is None:
        task_dict['updated_at'] = task.updated_at.replace(tzinfo=timezone.utc)
    
    # Add computed property
    task_dict['total_minutes_spent'] = task.total_minutes_spent
    return TaskPublic(**task_dict)


@router.get("/", response_model=list[TaskPublic])
def list_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> list[TaskPublic]:
    """List all tasks for the current user, with computed total_minutes_spent."""
    from datetime import datetime, timezone
    
    # Clean up orphaned instances (instances pointing to non-recurring templates)
    # Find all instances with a recurring_template_id
    all_instances = (
        db.query(Task)
        .filter(
            Task.user_id == current_user.id,
            Task.recurring_template_id.isnot(None),
            Task.is_recurring_template.is_(False),
        )
        .all()
    )
    
    # Find which templates are no longer recurring
    if all_instances:
        template_ids_to_check = {inst.recurring_template_id for inst in all_instances if inst.recurring_template_id}
        non_recurring_templates = (
            db.query(Task)
            .filter(
                Task.id.in_(template_ids_to_check),
                Task.user_id == current_user.id,
                Task.is_recurring_template.is_(False),
            )
            .all()
        )
        
        template_ids_to_clear = {t.id for t in non_recurring_templates}
        if template_ids_to_clear:
            # Get future uncompleted instances before clearing the link
            now = datetime.now(timezone.utc)
            future_instances_to_delete = (
                db.query(Task)
                .filter(
                    Task.user_id == current_user.id,
                    Task.recurring_template_id.in_(template_ids_to_clear),
                    Task.is_completed.is_(False),
                    (Task.deadline.is_(None) | (Task.deadline.isnot(None) & (Task.deadline > now))),
                )
                .all()
            )
            
            # Delete future instances
            for instance in future_instances_to_delete:
                db.delete(instance)
            
            # Clear recurring_template_id from remaining instances
            (
                db.query(Task)
                .filter(
                    Task.user_id == current_user.id,
                    Task.recurring_template_id.in_(template_ids_to_clear),
                )
                .update({Task.recurring_template_id: None}, synchronize_session=False)
            )
            db.commit()
    
    tasks = (
        db.query(Task)
        .filter(Task.user_id == current_user.id)
        .order_by(Task.is_completed.asc(), Task.deadline.asc().nulls_last())
        .all()
    )
    return [_serialize_task(task) for task in tasks]


@router.get("/{task_id}/template", response_model=TaskPublic)
def get_template_for_instance(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> TaskPublic:
    """Get the template for a recurring task instance"""
    instance = _get_task_or_404(db, task_id, current_user)
    if not instance.recurring_template_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This task is not a recurring instance"
        )
    template = db.query(Task).filter(
        Task.id == instance.recurring_template_id,
        Task.user_id == current_user.id,
        Task.is_recurring_template.is_(True)
    ).first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    return _serialize_task(template)


@router.post("/", response_model=TaskPublic, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> TaskPublic:
    task_data = payload.dict()
    # Convert status enum to string value for storage
    if 'status' in task_data and isinstance(task_data['status'], TaskStatus):
        task_data['status'] = task_data['status'].value
    # Convert subtasks list to JSON-compatible format
    if 'subtasks' in task_data and task_data['subtasks'] is not None:
        task_data['subtasks'] = [st.dict() if isinstance(st, Subtask) else st for st in task_data['subtasks']]
    
    # Handle recurring template
    is_recurring = task_data.get('is_recurring_template', False)
    recurrence_pattern = task_data.get('recurrence_pattern')
    
    task = Task(user_id=current_user.id, **task_data)
    db.add(task)
    db.commit()
    db.refresh(task)
    
    # If this is a recurring template, generate initial instances
    # Generate 2 weeks ahead by default (reduces clutter, instances auto-generate on completion)
    if is_recurring and recurrence_pattern:
        recurring_tasks.generate_recurring_instances(db, task, weeks_ahead=2)
        # Clear deadline from template after generating instances
        # (templates shouldn't have deadlines - only instances do)
        task.deadline = None
        db.commit()
        db.refresh(task)
    
    return _serialize_task(task)


def _store_old_pattern(task: Task) -> dict | None:
    """Store old recurrence pattern for change detection."""
    if task.is_recurring_template and task.recurrence_pattern:
        import copy
        return copy.deepcopy(task.recurrence_pattern)
    return None


def _parse_update_data(payload: TaskUpdate, task_id: int) -> tuple[dict, set]:
    """Parse update payload and get fields set."""
    try:
        update_data = payload.dict(exclude_unset=True)
    except Exception as e:
        logger.error(f"Error parsing update payload for task {task_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid update payload: {str(e)}"
        )
    fields_set = getattr(payload, '__fields_set__', None) or getattr(payload, 'model_fields_set', set())
    return update_data, fields_set


def _apply_field_updates(task: Task, update_data: dict, fields_set: set, payload: TaskUpdate) -> None:
    """Apply field updates to task."""
    # actual_minutes_spent is readonly - only updated by session completion
    readonly_fields = {'id', 'user_id', 'created_at', 'updated_at', 'recurring_template_id', 'next_occurrence_date', 'actual_minutes_spent'}
    
    for key, value in update_data.items():
        if key in readonly_fields:
            continue
        if key == 'status' and isinstance(value, TaskStatus):
            setattr(task, key, value.value)
        elif key == 'subtasks' and value is not None:
            subtasks_json = [st.dict() if isinstance(st, Subtask) else st for st in value]
            setattr(task, key, subtasks_json)
        elif key == 'recurrence_pattern' and value is not None:
            setattr(task, key, value)
        else:
            setattr(task, key, value)
    
    if 'subject_id' in fields_set:
        task.subject_id = payload.subject_id


def _sync_is_completed_with_status(task: Task, payload: TaskUpdate, fields_set: set) -> None:
    """Sync is_completed field with status changes."""
    if 'is_completed' in fields_set:
        if payload.is_completed:
            task.status = TaskStatus.COMPLETED.value
        elif task.status == TaskStatus.COMPLETED.value or task.status == "completed":
            task.status = TaskStatus.TODO.value


def _sync_status_with_is_completed(
    task: Task, payload: TaskUpdate, fields_set: set, db: Session
) -> None:
    """Sync status field with is_completed changes."""
    if 'status' not in fields_set:
        return
    
    status_value = payload.status.value if isinstance(payload.status, TaskStatus) else payload.status
    if status_value == TaskStatus.COMPLETED.value or status_value == "completed":
        task.is_completed = True
        if task.recurring_template_id and not task.is_recurring_template:
            try:
                recurring_tasks.generate_next_instance_on_completion(db, task)
            except Exception:
                pass
    elif task.is_completed and status_value != TaskStatus.COMPLETED.value and status_value != "completed":
        task.is_completed = False


def _handle_recurrence_pattern_update(
    task: Task, old_pattern: dict | None, fields_set: set, db: Session
) -> None:
    """Handle recurrence pattern updates."""
    if 'recurrence_pattern' not in fields_set:
        return
    
    new_pattern = task.recurrence_pattern
    
    # If removing recurrence (pattern set to None)
    if not new_pattern and task.is_recurring_template:
        recurring_tasks.remove_recurrence(db, task)
        return
    
    # If not a recurring template, skip
    if not task.is_recurring_template:
        return
    
    # Pattern changed
    if old_pattern and new_pattern and old_pattern != new_pattern:
        recurring_tasks.update_uncompleted_instances_for_new_pattern(db, task, new_pattern)
    
    # Generate new instances if pattern exists
    if new_pattern:
        recurring_tasks.generate_recurring_instances(db, task, weeks_ahead=2, force_regenerate=False)


def _handle_making_recurring(
    task: Task, old_pattern: dict | None, fields_set: set, db: Session
) -> None:
    """Handle making a task recurring for the first time."""
    if 'is_recurring_template' in fields_set and task.is_recurring_template and task.recurrence_pattern:
        if not old_pattern:
            recurring_tasks.generate_recurring_instances(db, task, weeks_ahead=2, force_regenerate=False)


@router.patch("/{task_id}", response_model=TaskPublic)
def update_task(
    task_id: int,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> TaskPublic:
    task = _get_task_or_404(db, task_id, current_user)
    
    # Store old values BEFORE applying updates
    old_pattern = _store_old_pattern(task)
    old_is_recurring_template = task.is_recurring_template
    
    update_data, fields_set = _parse_update_data(payload, task_id)
    _apply_field_updates(task, update_data, fields_set, payload)
    _sync_is_completed_with_status(task, payload, fields_set)
    _sync_status_with_is_completed(task, payload, fields_set, db)
    
    # Handle removing recurrence (check old value since field may have been updated)
    if 'is_recurring_template' in fields_set and not task.is_recurring_template and old_is_recurring_template:
        # Recurrence is being removed - delete future instances
        recurring_tasks.remove_recurrence(db, task)
    else:
        # Handle other recurrence pattern updates
        _handle_recurrence_pattern_update(task, old_pattern, fields_set, db)
        _handle_making_recurring(task, old_pattern, fields_set, db)
    
    # Clean up instances past end date if end date was set or updated
    if 'recurrence_end_date' in fields_set and task.is_recurring_template:
        recurring_tasks.cleanup_instances_past_end_date(db, task)
    
    db.add(task)
    db.commit()
    db.refresh(task)
    return _serialize_task(task)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> None:
    task = _get_task_or_404(db, task_id, current_user)
    db.delete(task)
    db.commit()


def _parse_subtasks_json(reply: str) -> list[dict]:
    """Extract and parse JSON array from AI reply."""
    import json
    import re
    
    json_match = re.search(r'\[.*\]', reply, re.DOTALL)
    if json_match:
        return json.loads(json_match.group(0))
    return json.loads(reply.strip())


def _convert_to_subtasks(subtasks_data: list[dict], task_id: int) -> list[Subtask]:
    """Convert JSON data to Subtask models."""
    subtasks = []
    for idx, st_data in enumerate(subtasks_data):
        if isinstance(st_data, dict):
            subtask = Subtask(
                id=f"ai-{task_id}-{idx}",
                title=st_data.get("title", "").strip(),
                completed=False,
                estimated_minutes=st_data.get("estimated_minutes")
            )
            if subtask.title:
                subtasks.append(subtask)
    return subtasks


def _generate_fallback_subtasks(task: Task, task_id: int) -> list[Subtask]:
    """Generate simple fallback subtasks based on task title."""
    import re
    words = re.findall(r'\b\w+\b', task.title.lower())
    if len(words) > 2:
        parts = [
            f"Research and plan {task.title}",
            f"Work on {task.title}",
            f"Review and finalize {task.title}"
        ]
    else:
        parts = [
            f"Prepare for {task.title}",
            f"Complete {task.title}",
            f"Review {task.title}"
        ]
    
    return [
        Subtask(
            id=f"fallback-{task_id}-{idx}",
            title=part,
            completed=False,
            estimated_minutes=task.estimated_minutes // len(parts) if task.estimated_minutes else None
        )
        for idx, part in enumerate(parts[:5])
    ]


@router.post("/{task_id}/generate-subtasks", response_model=list[Subtask])
def generate_subtasks(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> list[Subtask]:
    """Use AI to generate subtasks for a task"""
    task = _get_task_or_404(db, task_id, current_user)
    
    subject_name = task.subject.name if task.subject else "General"
    prompt = f"""Break down this task into 3-7 specific, actionable subtasks:
Task: {task.title}
Description: {task.description or "No description provided"}
Subject: {subject_name}
Estimated time: {task.estimated_minutes} minutes

Return ONLY a JSON array of subtasks, each with: {{"title": "subtask name", "estimated_minutes": number}}
Example: [{{"title": "Research topic", "estimated_minutes": 30}}, {{"title": "Create outline", "estimated_minutes": 20}}]
Do not include any other text, just the JSON array."""
    
    try:
        adapter = get_coach_adapter()
        context = coach_service.build_coach_context(db, current_user)
        response = adapter.chat(current_user, prompt, context)
        reply = response.get("reply", "")
        
        subtasks_data = _parse_subtasks_json(reply)
        subtasks = _convert_to_subtasks(subtasks_data, task_id)
        
        if not subtasks:
            raise ValueError("No valid subtasks generated")
        
        return subtasks
        
    except Exception:
        return _generate_fallback_subtasks(task, task_id)


@router.post("/{task_id}/generate-instances", response_model=list[TaskPublic])
def generate_recurring_instances(
    task_id: int,
    weeks_ahead: int = 4,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> list[TaskPublic]:
    """Manually generate recurring task instances for a template"""
    template = _get_task_or_404(db, task_id, current_user)
    
    if not template.is_recurring_template:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Task is not a recurring template",
        )
    
    instances = recurring_tasks.generate_recurring_instances(
        db, template, weeks_ahead=weeks_ahead
    )
    
    return [_serialize_task(instance) for instance in instances]

