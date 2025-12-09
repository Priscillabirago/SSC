from datetime import datetime, time

from pydantic import BaseModel

from app.models.constraint import ConstraintType


class ConstraintBase(BaseModel):
    name: str
    type: ConstraintType = ConstraintType.BUSY
    description: str | None = None
    start_time: time | None = None
    end_time: time | None = None
    start_datetime: datetime | None = None
    end_datetime: datetime | None = None
    is_recurring: bool = False
    days_of_week: list[int] | None = None


class ConstraintCreate(ConstraintBase):
    pass


class ConstraintUpdate(BaseModel):
    name: str | None = None
    type: ConstraintType | None = None
    description: str | None = None
    start_time: time | None = None
    end_time: time | None = None
    start_datetime: datetime | None = None
    end_datetime: datetime | None = None
    is_recurring: bool | None = None
    days_of_week: list[int] | None = None


class ConstraintPublic(ConstraintBase):
    id: int
    user_id: int

    class Config:
        from_attributes = True

