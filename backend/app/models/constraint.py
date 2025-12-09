from datetime import datetime, time
from enum import Enum as PyEnum

from sqlalchemy import (
    Column,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Integer,
    String,
    Time,
    Boolean,   # Use Boolean from sqlalchemy for cross-db support
    JSON        # Use JSON for cross-db array/list
)
from sqlalchemy.orm import relationship

from app.db.base import Base


class ConstraintType(str, PyEnum):
    CLASS = "class"
    BUSY = "busy"
    BLOCKED = "blocked"
    NO_STUDY = "no_study"


class ScheduleConstraint(Base):
    __tablename__ = "schedule_constraints"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    type = Column(SQLEnum(ConstraintType), nullable=False, default=ConstraintType.BUSY)
    description = Column(String(512), nullable=True)
    start_time = Column(Time, nullable=True)
    end_time = Column(Time, nullable=True)
    start_datetime = Column(DateTime, nullable=True)
    end_datetime = Column(DateTime, nullable=True)
    is_recurring = Column(Boolean, nullable=False, default=False)
    days_of_week = Column(JSON, nullable=True)  # 0 = Monday
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    user = relationship("User", back_populates="constraints")

