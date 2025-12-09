from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.models.subject import Subject
from app.models.user import User


class TaskPriority(str, PyEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class TaskStatus(str, PyEnum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    ON_HOLD = "on_hold"
    COMPLETED = "completed"


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    subject_id = Column(
        Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=True
    )
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    deadline = Column(DateTime, nullable=True)
    estimated_minutes = Column(Integer, nullable=False, default=60)
    actual_minutes_spent = Column(Integer, nullable=True, default=None)  # Session time only (calculated from sessions)
    timer_minutes_spent = Column(Integer, nullable=False, default=0)  # Timer time (from Tasks page timer)
    priority = Column(SQLEnum(TaskPriority), nullable=False, default=TaskPriority.MEDIUM)
    # Use String for SQLite compatibility - enum values are stored as lowercase strings
    status = Column(String(20), nullable=False, default=TaskStatus.TODO.value)
    # Subtasks stored as JSON: [{"id": "uuid", "title": "string", "completed": bool, "estimated_minutes": int}]
    subtasks = Column(JSON, nullable=True, default=None)
    is_completed = Column(Boolean, nullable=False, default=False)
    
    # Recurring task fields
    is_recurring_template = Column(Boolean, nullable=False, default=False)
    recurring_template_id = Column(
        Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True
    )
    # Recurrence pattern stored as JSON:
    # {"frequency": "daily|weekly|biweekly|monthly", "interval": 1, "days_of_week": [0,2,4],
    #  "day_of_month": 15, "week_of_month": 2, "advance_days": 3}
    recurrence_pattern = Column(JSON, nullable=True, default=None)
    recurrence_end_date = Column(DateTime, nullable=True, default=None)
    next_occurrence_date = Column(DateTime, nullable=True, default=None)
    
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    user = relationship("User", back_populates="tasks")
    subject = relationship("Subject", back_populates="tasks")
    recurring_template = relationship(
        "Task", remote_side=[id], backref="recurring_instances"
    )

    @hybrid_property
    def status_enum(self) -> TaskStatus:
        """Return status as TaskStatus enum"""
        if isinstance(self.status, TaskStatus):
            return self.status
        return TaskStatus(self.status) if self.status else TaskStatus.TODO
    
    @hybrid_property
    def total_minutes_spent(self) -> int:
        """Total time spent = session time (actual_minutes_spent) + timer time (timer_minutes_spent)"""
        session_time = self.actual_minutes_spent or 0
        timer_time = self.timer_minutes_spent or 0
        return session_time + timer_time

