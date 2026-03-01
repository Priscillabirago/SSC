from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, UniqueConstraint
from sqlalchemy import JSON
from sqlalchemy.orm import relationship

from app.db.base import Base

CASCADE_ALL_DELETE_ORPHAN = "all, delete-orphan"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("email", name="uq_users_email"),)

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    timezone = Column(String(64), nullable=False, default="UTC")
    weekly_study_hours = Column(Integer, nullable=False, default=10)
    preferred_study_windows = Column(JSON, nullable=False, default=dict)
    max_session_length = Column(Integer, nullable=False, default=120)
    break_duration = Column(Integer, nullable=False, default=15)
    energy_tagging_enabled = Column(Boolean, nullable=False, default=True)
    calendar_token = Column(String(64), nullable=True, unique=True, index=True)
    plan_share_token = Column(String(64), nullable=True, unique=True, index=True)
    plan_share_expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    subjects = relationship(
        "Subject", back_populates="user", cascade=CASCADE_ALL_DELETE_ORPHAN
    )
    tasks = relationship(
        "Task", back_populates="user", cascade=CASCADE_ALL_DELETE_ORPHAN
    )
    coach_messages = relationship(
        "CoachMessage",
        back_populates="user",
        cascade=CASCADE_ALL_DELETE_ORPHAN,
        lazy="joined"
    )
    constraints = relationship(
        "ScheduleConstraint",
        back_populates="user",
        cascade=CASCADE_ALL_DELETE_ORPHAN,
    )
    sessions = relationship(
        "StudySession",
        back_populates="user",
        cascade=CASCADE_ALL_DELETE_ORPHAN,
    )
    energy_logs = relationship(
        "DailyEnergy",
        back_populates="user",
        cascade=CASCADE_ALL_DELETE_ORPHAN,
    )
    reflections = relationship(
        "DailyReflection",
        back_populates="user",
        cascade=CASCADE_ALL_DELETE_ORPHAN,
    )
    coach_memories = relationship(
        "CoachMemory",
        back_populates="user",
        cascade=CASCADE_ALL_DELETE_ORPHAN,
    )

