from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class StudyBlock(BaseModel):
    start_time: datetime
    end_time: datetime
    subject_id: int | None = None
    task_id: int | None = None
    focus: str
    energy_level: Literal["low", "medium", "high"] | None = None
    generated_by: Literal["weekly", "micro"] = "weekly"


class DailyPlan(BaseModel):
    day: datetime
    sessions: list[StudyBlock]


class WeeklyPlan(BaseModel):
    user_id: int
    generated_at: datetime
    days: list[DailyPlan]
    optimization_explanation: str | None = None  # AI optimization explanation if used

