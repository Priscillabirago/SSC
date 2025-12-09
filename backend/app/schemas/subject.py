from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.subject import SubjectDifficulty, SubjectPriority


class SubjectBase(BaseModel):
    name: str
    priority: SubjectPriority = SubjectPriority.MEDIUM
    difficulty: SubjectDifficulty = SubjectDifficulty.MEDIUM
    workload: int = Field(default=3, ge=1)
    exam_date: date | None = None
    color: str = "#4B5563"


class SubjectCreate(SubjectBase):
    pass


class SubjectUpdate(BaseModel):
    name: str | None = None
    priority: SubjectPriority | None = None
    difficulty: SubjectDifficulty | None = None
    workload: int | None = Field(default=None, ge=1)
    exam_date: date | None = None
    color: str | None = None


class SubjectInDBBase(SubjectBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SubjectPublic(SubjectInDBBase):
    pass

