from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.task import TaskPriority, TaskStatus


class RecurrencePattern(BaseModel):
    """Recurrence pattern configuration"""
    frequency: str = Field(..., description="daily, weekly, biweekly, or monthly")
    interval: int = Field(default=1, ge=1, description="Every N frequency units")
    days_of_week: list[int] | None = Field(default=None, description="0=Monday, 6=Sunday")
    day_of_month: int | None = Field(default=None, ge=1, le=31, description="Day of month for monthly")
    week_of_month: int | None = Field(default=None, ge=1, le=4, description="Week of month (1-4)")
    advance_days: int = Field(default=3, ge=0, description="Create instances N days before due")


class Subtask(BaseModel):
    """Subtask model for checklists"""
    id: str  # UUID or simple identifier
    title: str
    completed: bool = False
    estimated_minutes: int | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, description="Optional notes/details for the subtask")


class TaskBase(BaseModel):
    title: str
    description: str | None = None
    notes: str | None = None  # User notes for the task
    deadline: datetime | None = None
    estimated_minutes: int = Field(default=60, ge=5)
    actual_minutes_spent: int | None = Field(default=None, ge=0)  # Session time only
    timer_minutes_spent: int | None = Field(default=None, ge=0)  # Timer time only
    priority: TaskPriority = TaskPriority.MEDIUM
    status: TaskStatus = TaskStatus.TODO
    subject_id: int | None = None
    subtasks: list[Subtask] | None = None
    # Recurring task fields
    is_recurring_template: bool = False
    recurrence_pattern: dict[str, Any] | None = None  # RecurrencePattern as dict
    recurrence_end_date: datetime | None = None


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    notes: str | None = None
    deadline: datetime | None = None
    estimated_minutes: int | None = Field(default=None, ge=5)
    actual_minutes_spent: int | None = Field(default=None, ge=0)  # Session time only
    timer_minutes_spent: int | None = Field(default=None, ge=0)  # Timer time only
    priority: TaskPriority | None = None
    status: TaskStatus | None = None
    subject_id: int | None = None
    subtasks: list[Subtask] | None = None
    is_completed: bool | None = None
    # Recurring task fields
    is_recurring_template: bool | None = None
    recurrence_pattern: dict[str, Any] | None = None
    recurrence_end_date: datetime | None = None
    
    class Config:
        # Allow extra fields to be ignored (frontend might send read-only fields)
        extra = "ignore"


class TaskInDBBase(TaskBase):
    id: int
    user_id: int
    is_completed: bool
    completed_at: datetime | None = None  # Timestamp when task was marked complete
    prevent_auto_completion: bool = False  # If True, don't auto-complete even if time >= estimate
    recurring_template_id: int | None = None
    next_occurrence_date: datetime | None = None
    created_at: datetime
    updated_at: datetime
    # Computed property (not stored in DB, calculated from actual_minutes_spent + timer_minutes_spent)
    total_minutes_spent: int | None = None

    class Config:
        from_attributes = True


class TaskPublic(TaskInDBBase):
    pass

