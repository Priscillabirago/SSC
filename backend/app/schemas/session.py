from datetime import datetime

from pydantic import BaseModel

from app.models.study_session import SessionStatus


class StudySessionPublic(BaseModel):
    id: int
    user_id: int
    subject_id: int | None
    task_id: int | None
    start_time: datetime
    end_time: datetime
    status: SessionStatus
    energy_level: str | None
    generated_by: str | None
    is_pinned: bool = False
    focus: str | None = None

    class Config:
        from_attributes = True


class StudySessionUpdate(BaseModel):
    status: SessionStatus | None = None
    notes: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    is_pinned: bool | None = None


class StudySessionCreate(BaseModel):
    """Schema for creating a manual session."""
    task_id: int | None = None
    subject_id: int | None = None
    start_time: datetime
    end_time: datetime
    is_pinned: bool = True  # Manual sessions are pinned by default

