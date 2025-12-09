from datetime import date, datetime

from pydantic import BaseModel


class ReflectionBase(BaseModel):
    day: date
    worked: str | None = None
    challenging: str | None = None
    summary: str | None = None
    suggestion: str | None = None


class ReflectionCreate(ReflectionBase):
    pass


class ReflectionPublic(ReflectionBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

