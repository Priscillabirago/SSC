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
    focus: str | None = None

    class Config:
        from_attributes = True


class StudySessionUpdate(BaseModel):
    status: SessionStatus | None = None
    notes: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None

