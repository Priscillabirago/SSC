from datetime import date, datetime
from enum import Enum as PyEnum

from sqlalchemy import Column, Date, DateTime, Enum as SQLEnum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.user import User


class SubjectPriority(str, PyEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class SubjectDifficulty(str, PyEnum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    priority: Mapped[SubjectPriority] = mapped_column(
        SQLEnum(SubjectPriority), nullable=False, default=SubjectPriority.MEDIUM
    )
    difficulty: Mapped[SubjectDifficulty] = mapped_column(
        SQLEnum(SubjectDifficulty), nullable=False, default=SubjectDifficulty.MEDIUM
    )
    workload: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    exam_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    color: Mapped[str] = mapped_column(String(32), nullable=False, default="#4B5563")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    user: Mapped[User] = relationship("User", back_populates="subjects")
    tasks = relationship(
        "Task", back_populates="subject", cascade="all, delete-orphan"
    )
    sessions = relationship(
        "StudySession", back_populates="subject", cascade="all, delete-orphan"
    )

